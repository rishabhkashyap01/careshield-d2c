#!/usr/bin/env node
/**
 * Visual test report.
 *
 *   npm run test:report            run every suite, write reports/test-report.html
 *   npm run test:report -- --open  …and open it in your browser
 *
 * Runs the four suites one after another (API unit, database, API end-to-end,
 * website), collects the machine-readable results, and renders ONE
 * self-contained HTML file (no server, no internet needed) from
 * scripts/test-report/template.html. The database and end-to-end suites need
 * PostgreSQL running (docker compose up -d); if it isn't, the report shows
 * exactly which files could not run and why.
 *
 * Exits with code 1 if any test failed, so it can also gate a CI job.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'reports');
const RAW = join(OUT_DIR, '.raw');
const OUT = join(OUT_DIR, 'test-report.html');
const API = join(ROOT, 'apps', 'api');
const WEB = join(ROOT, 'apps', 'web');
const open = process.argv.includes('--open');

/** fast-check's own default when a test doesn't set numRuns. */
const FC_DEFAULT_RUNS = 100;
const FC_OVERRIDE = Number(process.env.FC_NUM_RUNS) || null;

const SUITES = [
  { id: 'unit', name: 'API unit', command: 'npm run api:test', covers: 'Pricing, the 15-minute lock, state machine, eligibility, validation, webhooks — pure logic, no database.' },
  { id: 'db', name: 'Database', command: 'npm run api:test:db', covers: 'CHECK constraints, triggers and the audit trail, run against a real PostgreSQL.' },
  { id: 'e2e', name: 'API end-to-end', command: 'npm run api:test:e2e', covers: 'The whole API over HTTP: quotes, declarations, checkout, idempotency, slow payments, outages.' },
  { id: 'web', name: 'Website', command: 'npm run web:test', covers: 'The countdown maths: server time, round trips, wrong device clocks, sleep.' },
];

/** Which step of the purchase journey a test file belongs to (by file name). */
const STAGES = [
  { id: 'quote', name: 'Get a quote', match: /premium-calculator|pricing-and-lock|quote\.e2e|quote-response|journey\.property/ },
  { id: 'declare', name: 'Health declaration', match: /eligibility|medical-declaration|state-machine-and-eligibility/ },
  { id: 'pay', name: 'Pay', match: /checkout|payment-lifecycle|webhook-and-response|idempotency/ },
  { id: 'lock', name: 'Price lock & countdown', match: /lock-clock/ },
  { id: 'audit', name: 'State machine & audit trail', match: /schema\.int|lifecycle\.property|audit-trail|quote-state-machine\.spec/ },
  { id: 'platform', name: 'Validation & reliability', match: /request-validation|health|database-outage|database-unavailable/ },
];
const stageOf = (file) => (STAGES.find((s) => s.match.test(file)) ?? STAGES[5]).id;

// ---------------------------------------------------------------------------
// helpers

const log = (msg) => process.stdout.write(msg);
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const stripAnsi = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const decodeXml = (s) =>
  String(s ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

function listFiles(dir, test) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'generated') out.push(...listFiles(p, test));
    else if (test(entry.name)) out.push(p);
  }
  return out.sort();
}

/**
 * For each test title in a source file: is it a generated (fast-check) test,
 * and how many random cases does it try? Read from the source itself.
 */
function inspectSource(absPath) {
  let src = '';
  try {
    src = readFileSync(absPath, 'utf8');
  } catch {
    return () => ({ generated: false, runs: 0 });
  }
  const fileDefault = Number(src.match(/Number\(process\.env\.FC_NUM_RUNS\)\s*\|\|\s*([\d_]+)/)?.[1]?.replace(/_/g, '')) || FC_DEFAULT_RUNS;
  const runs = FC_OVERRIDE ?? fileDefault;
  // Split the file into test blocks at each it( / test( call.
  const starts = [...src.matchAll(/\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(['"`])/g)].map((m) => m.index);
  const blocks = starts.map((s, i) => src.slice(s, starts[i + 1] ?? src.length));
  return (title) => {
    const variants = [title, title.replace(/'/g, "\\'"), title.replace(/"/g, '\\"')];
    const block = blocks.find((b) => variants.some((v) => b.slice(0, 400).includes(v)));
    const generated = !!block && /fc\.assert\(|\bassert\(\s*fc\./.test(block);
    return { generated, runs: generated ? runs : 0 };
  };
}

// ---------------------------------------------------------------------------
// run the suites

function runVitest(suite) {
  const json = join(RAW, `${suite.id}.json`);
  const t0 = Date.now();
  const r = spawnSync(
    'npx',
    ['vitest', 'run', '--project', suite.id, '--reporter=json', `--outputFile.json=${json}`],
    { cwd: API, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' }, maxBuffer: 64 * 1024 * 1024 },
  );
  const wallMs = Date.now() - t0;
  const data = readJson(json);
  if (!data) {
    return { files: [], wallMs, error: stripAnsi(r.stderr || r.stdout).slice(-4000) || 'The suite did not produce results.' };
  }
  const files = data.testResults.map((f) => {
    const rel = relative(ROOT, f.name);
    const inspect = inspectSource(f.name);
    const tests = f.assertionResults.map((a) => ({
      title: a.title,
      ancestors: a.ancestorTitles,
      status: a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped',
      durationMs: Math.round((a.duration ?? 0) * 10) / 10,
      failure: a.failureMessages?.length ? stripAnsi(a.failureMessages.join('\n\n')).slice(0, 6000) : null,
      ...inspect(a.title),
    }));
    return {
      path: rel,
      stage: stageOf(rel),
      durationMs: Math.round(tests.reduce((s, t) => s + t.durationMs, 0)),
      tests,
      // A file that crashed before running any test (e.g. database unreachable).
      error: f.status === 'failed' && tests.length === 0 ? stripAnsi(f.message).slice(0, 6000) : null,
    };
  });
  return { files, wallMs, error: null };
}

function runNodeTests(suite) {
  const testFiles = listFiles(join(WEB, 'src'), (n) => n.endsWith('.test.ts'));
  const t0 = Date.now();
  const files = testFiles.map((abs) => {
    const xmlPath = join(RAW, `web-${basename(abs)}.xml`);
    spawnSync(
      'node',
      ['--no-warnings', '--experimental-strip-types', '--test', '--test-reporter=junit', `--test-reporter-destination=${xmlPath}`, abs],
      { cwd: WEB, encoding: 'utf8', env: process.env },
    );
    const xml = existsSync(xmlPath) ? readFileSync(xmlPath, 'utf8') : '';
    const rel = relative(ROOT, abs);
    const inspect = inspectSource(abs);
    const tests = [];
    // <testsuite name="describe"> … <testcase name="it" time="s">(<failure …>…</failure>)?</testcase>
    for (const suiteM of xml.matchAll(/<testsuite name="([^"]*)"[^>]*>([\s\S]*?)<\/testsuite>/g)) {
      for (const c of suiteM[2].matchAll(/<testcase name="([^"]*)" time="([\d.]+)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)) {
        const body = c[4] ?? '';
        const failed = /<failure/.test(body);
        const skipped = /<skipped/.test(body);
        const title = decodeXml(c[1]);
        tests.push({
          title,
          ancestors: [decodeXml(suiteM[1])],
          status: failed ? 'failed' : skipped ? 'skipped' : 'passed',
          durationMs: Math.round(Number(c[2]) * 10000) / 10,
          failure: failed ? decodeXml(body.replace(/<[^>]+>/g, ' ')).trim().slice(0, 6000) : null,
          ...inspect(title),
        });
      }
    }
    return {
      path: rel,
      stage: stageOf(rel),
      durationMs: Math.round(tests.reduce((s, t) => s + t.durationMs, 0)),
      tests,
      error: tests.length === 0 ? 'No results: the file failed to load. Run `npm run web:test` to see why.' : null,
    };
  });
  return { files, wallMs: Date.now() - t0, error: null };
}

// ---------------------------------------------------------------------------

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
log(`\nCareShield test report${FC_OVERRIDE ? ` (FC_NUM_RUNS=${FC_OVERRIDE})` : ''}\n`);

const startedAt = new Date();
// Read before the suites run: "was the code under test committed?"
const dirtyFiles = git('status', '--porcelain', '--untracked-files=normal');
const results = [];
for (const suite of SUITES) {
  log(`  ▸ ${suite.name.padEnd(16)} `);
  const r = suite.id === 'web' ? runNodeTests(suite) : runVitest(suite);
  const all = r.files.flatMap((f) => f.tests);
  const failed = all.filter((t) => t.status === 'failed').length + r.files.filter((f) => f.error).length + (r.error ? 1 : 0);
  log(`${failed ? '✗' : '✓'} ${all.filter((t) => t.status === 'passed').length}/${all.length} passed · ${(r.wallMs / 1000).toFixed(1)} s\n`);
  results.push({ ...suite, ...r });
}

const data = {
  generatedAt: new Date().toISOString(),
  startedAt: startedAt.toISOString(),
  wallMs: Date.now() - startedAt.getTime(),
  fcOverride: FC_OVERRIDE,
  git: {
    commit: git('rev-parse', '--short', 'HEAD'),
    subject: git('log', '-1', '--format=%s'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    dirty: dirtyFiles.length > 0,
  },
  env: { node: process.version, platform: `${process.platform} ${process.arch}` },
  stages: STAGES.map(({ id, name }) => ({ id, name })),
  suites: results,
};

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'template.html'), 'utf8');
const html = template.replace(
  '/*__REPORT_DATA__*/null',
  // Safe to inline inside <script>: no "</script>" can break out.
  JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, ''),
);
writeFileSync(OUT, html);
rmSync(RAW, { recursive: true, force: true });

const tests = results.flatMap((s) => s.files.flatMap((f) => f.tests));
const failedCount = tests.filter((t) => t.status === 'failed').length + results.flatMap((s) => s.files).filter((f) => f.error).length + results.filter((s) => s.error).length;
log(`\n  ${failedCount ? `✗ ${failedCount} problem(s)` : `✓ all ${tests.length} tests passed`} in ${(data.wallMs / 1000).toFixed(0)} s\n  → ${relative(process.cwd(), OUT) || OUT}\n\n`);

if (open) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawnSync(opener, [OUT], { stdio: 'ignore' });
}
process.exit(failedCount ? 1 : 0);
