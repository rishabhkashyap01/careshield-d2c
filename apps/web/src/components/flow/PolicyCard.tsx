import { formatDate, formatMoney } from '@/lib/format';
import { ShieldIcon } from '../icons';

/** A card-shaped rendering of an issued policy (also used, as a sample, on the landing page). */
export function PolicyCard({
  policyNumber,
  premium,
  coverageStart,
  coverageEnd,
  sample = false,
}: {
  policyNumber: string;
  premium: string;
  coverageStart: string;
  coverageEnd: string;
  sample?: boolean;
}) {
  return (
    <div className="relative aspect-[1.6/1] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950 p-6 text-white shadow-lift">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-400/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-mint-400/25 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 animate-shimmer opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 45%, transparent 60%)',
          backgroundSize: '200% 100%',
        }}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/15 backdrop-blur">
              <ShieldIcon className="h-5 w-5" />
            </span>
            CareShield Max
          </div>
          <span className="rounded-full bg-mint-400/20 px-2.5 py-1 text-xs font-semibold text-mint-400 ring-1 ring-mint-400/40">
            {sample ? 'Sample' : 'Active'}
          </span>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/60">
            Policy number
          </p>
          <p
            className="mt-1 font-mono text-xl font-semibold tracking-wider sm:text-2xl"
            data-testid={sample ? undefined : 'policy-number'}
          >
            {policyNumber}
          </p>
        </div>
        <div className="flex items-end justify-between gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/60">Cover</p>
            <p className="font-medium">
              {formatDate(coverageStart)} – {formatDate(coverageEnd)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-white/60">Premium</p>
            <p className="font-semibold tabular">{formatMoney(premium)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
