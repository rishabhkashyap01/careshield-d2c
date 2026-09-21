import { formatDate, formatMoney } from '@/lib/format';
import type { IssuedPolicy } from '@/lib/types';

export function PolicyIssued({ policy }: { policy: IssuedPolicy }) {
  return (
    <section aria-labelledby="issued-heading" className="space-y-4" tabIndex={-1}>
      <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <h2 id="issued-heading" className="text-xl font-semibold text-emerald-900">
          You’re covered
        </h2>
        <p className="mt-1 text-emerald-900">Your CareShield Max policy has been issued.</p>
      </div>
      <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-600">Policy number</dt>
          <dd className="font-mono text-lg font-semibold text-slate-900" data-testid="policy-number">
            {policy.policyNumber}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Premium paid</dt>
          <dd className="text-lg font-semibold text-slate-900">{formatMoney(policy.premiumPaid)}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Cover</dt>
          <dd className="text-slate-900">
            {formatDate(policy.coverageStart)} – {formatDate(policy.coverageEnd)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">Payment reference</dt>
          <dd className="font-mono text-slate-900">{policy.paymentReference}</dd>
        </div>
      </dl>
    </section>
  );
}
