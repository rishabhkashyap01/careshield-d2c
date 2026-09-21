import { PolicyCard } from '../flow/PolicyCard';
import { StartButton } from '../flow/StartButton';
import {
  BoltIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  HeartPulseIcon,
  LockIcon,
  Logo,
  ShieldIcon,
} from '../icons';

function Nav() {
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <Logo className="text-white" />
      <nav
        aria-label="Main"
        className="hidden items-center gap-8 text-sm font-medium text-white/70 md:flex"
      >
        <a href="#how" className="transition hover:text-white">
          How it works
        </a>
        <a href="#pricing" className="transition hover:text-white">
          Pricing
        </a>
        <a href="#faq" className="transition hover:text-white">
          FAQ
        </a>
      </nav>
      <StartButton variant="light" size="md">
        Get a quote
      </StartButton>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pb-32 lg:pt-16">
      <div className="animate-fade-up">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/15 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-mint-400 shadow-[0_0_10px_2px] shadow-mint-400/60" />
          100% online · policy issued instantly
        </p>
        <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
          Health cover in minutes,
          <span className="block bg-gradient-to-r from-brand-300 via-white to-mint-400 bg-clip-text text-transparent">
            not weeks.
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
          Tell us your age, answer a few health questions and pay. Your price is locked for 15
          minutes while you decide — and your policy number arrives the moment you pay.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <StartButton variant="light" className="px-7">
            Get my price
          </StartButton>
          <a
            href="#pricing"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
          >
            See how pricing works
          </a>
        </div>
        <ul className="mt-10 grid max-w-xl gap-3 text-sm text-white/70 sm:grid-cols-3">
          {[
            [ClockIcon, '15-minute price lock'],
            [BoltIcon, 'Instant policy'],
            [DocIcon, 'No paperwork'],
          ].map(([Icon, text]) => {
            const I = Icon as typeof ClockIcon;
            return (
              <li key={text as string} className="flex items-center gap-2">
                <I className="h-4 w-4 text-mint-400" /> {text as string}
              </li>
            );
          })}
        </ul>
      </div>

      <div
        className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:120ms] lg:max-w-none"
        aria-hidden="true"
      >
        <div className="absolute -inset-10 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="relative animate-float">
          <PolicyCard
            sample
            policyNumber="CSM-2026-000001"
            premium="15000.00"
            coverageStart="2026-09-22T00:00:00Z"
            coverageEnd="2027-09-22T00:00:00Z"
          />
        </div>
        <div className="absolute -bottom-12 right-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lift sm:-right-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-mint-400/15 text-mint-500">
            <ClockIcon className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Price locked
            </p>
            <p className="font-mono text-lg font-semibold tabular text-ink">14:59</p>
          </div>
        </div>
        <div className="absolute -bottom-10 left-4 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-sm font-semibold text-ink shadow-lift sm:-left-6">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-mint-500 text-white">
            <CheckIcon className="h-4 w-4" strokeWidth={2.6} />
          </span>
          Policy issued
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      Icon: ShieldIcon,
      title: 'Get your price',
      body: 'Your age and one health question. We calculate your premium instantly and hold it for 15 minutes.',
    },
    {
      Icon: HeartPulseIcon,
      title: 'Declare your health',
      body: 'Six yes/no questions. We check eligibility straight away — no medical exam, no forms to post.',
    },
    {
      Icon: LockIcon,
      title: 'Pay & get covered',
      body: 'Pay securely and receive your policy number immediately. You can never be charged twice.',
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-24 sm:px-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">How it works</p>
      <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Three steps. About two minutes.
      </h2>
      <ol className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map(({ Icon, title, body }, i) => (
          <li
            key={title}
            className="group relative rounded-3xl border border-slate-200 bg-white p-7 shadow-soft transition hover:-translate-y-1 hover:shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
                <Icon className="h-6 w-6" />
              </span>
              <span className="font-mono text-5xl font-semibold text-slate-100 transition group-hover:text-brand-100">
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-6 text-lg font-semibold text-ink">{title}</h3>
            <p className="mt-2 leading-relaxed text-slate-500">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Pricing() {
  const rows = [
    ['18–45', 'No', '₹10,000'],
    ['18–45', 'Yes', '₹15,000'],
    ['46–99', 'No', '₹15,000'],
    ['46–99', 'Yes', '₹20,000'],
  ];
  return (
    <section id="pricing" className="scroll-mt-10 bg-slate-50 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            Transparent pricing
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            No hidden factors. Just three rules.
          </h2>
          <ul className="mt-8 space-y-4">
            {[
              ['Base premium', '₹10,000 a year for everyone.'],
              ['Age over 45', 'Adds 50% of the base premium (₹5,000).'],
              ['Pre-existing condition', 'Adds a flat ₹5,000.'],
            ].map(([t, b]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                  <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.6} />
                </span>
                <p className="text-slate-600">
                  <span className="font-semibold text-ink">{t}.</span> {b}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <StartButton>Calculate my price</StartButton>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
          <table className="w-full text-left">
            <caption className="sr-only">Annual premium by age and pre-existing conditions</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-4 font-semibold sm:px-6">
                  Age
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-4 font-semibold sm:px-6">
                  Pre-existing
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-4 py-4 text-right font-semibold sm:px-6"
                >
                  Annual premium
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([age, pre, price]) => (
                <tr key={age + pre} className="transition hover:bg-brand-50/50">
                  <td className="whitespace-nowrap px-4 py-5 font-medium text-ink sm:px-6">
                    {age}
                  </td>
                  <td className="px-4 py-5 text-slate-600 sm:px-6">{pre}</td>
                  <td className="whitespace-nowrap px-4 py-5 text-right text-lg font-semibold tabular text-ink sm:px-6">
                    {price}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    [
      'What does “price locked” mean?',
      'Once we calculate your premium, that exact price is held for 15 minutes. Finish your declaration and payment within that time and you pay what you were quoted.',
    ],
    [
      'What happens if the 15 minutes run out?',
      'Payment is paused and you can recalculate with one click. Nothing is charged for an expired quote.',
    ],
    [
      'Could I be charged twice if I double-click Pay?',
      'No. Every payment carries a unique key, and a quote can only ever be paid once — even if the request is repeated or your connection drops mid-payment.',
    ],
    [
      'Is this real insurance?',
      'No — this is a demo product. The checkout uses mock payment methods and no real money is taken.',
    ],
  ];
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-10 px-5 py-24 sm:px-8">
      <h2 className="text-center text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Questions, answered
      </h2>
      <div className="mt-10 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white shadow-soft">
        {qs.map(([q, a]) => (
          <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200">
              {q}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition group-open:rotate-45 group-open:bg-brand-600 group-open:text-white">
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-slate-500">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 px-8 py-16 text-center text-white">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand-400/40 blur-3xl" />
        <div className="relative">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your price is one question away.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">
            It takes about two minutes, and your price is locked for fifteen.
          </p>
          <div className="mt-8 flex justify-center">
            <StartButton variant="light" className="px-7">
              Get my price
            </StartButton>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <>
      <div className="relative overflow-hidden bg-brand-950">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full bg-mint-400/15 blur-3xl" />
        <Nav />
        <main id="main">
          <Hero />
        </main>
      </div>
      <HowItWorks />
      <Pricing />
      <Faq />
      <FinalCta />
      <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-500">
        <p>CareShield Max is a demo product built as a technical exercise. Not a real insurer.</p>
      </footer>
    </>
  );
}
