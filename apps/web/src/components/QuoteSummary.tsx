import { formatMoney } from '@/lib/format';
import type { Quote } from '@/lib/types';

export function QuoteSummary({ quote }: { quote: Quote }) {
  const { premium, applicant } = quote;
  const rows: [string, string][] = [['Base premium', premium.base]];
  if (premium.ageLoading !== '0.00') rows.push(['Age loading (over 45)', premium.ageLoading]);
  if (premium.conditionLoading !== '0.00')
    rows.push(['Pre-existing condition loading', premium.conditionLoading]);

  return (
    <section aria-labelledby="summary-heading" className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 id="summary-heading" className="text-sm font-medium uppercase tracking-wide text-slate-600">
        CareShield Max · annual premium
      </h2>
      <p className="mt-1 text-4xl font-bold text-slate-900" data-testid="total-premium">
        {formatMoney(premium.total)}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Age {applicant.age} · {applicant.hasPreExistingConditions ? 'with' : 'no'} pre-existing conditions
      </p>
      <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-slate-600">{label}</dt>
            <dd className="font-medium tabular-nums text-slate-900">{formatMoney(amount)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
