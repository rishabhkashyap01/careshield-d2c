import type { Policy } from '../../generated/prisma/client.js';

/** Matches the IssuedPolicy contract the web app expects. Money as strings. */
export interface PolicyResponse {
  policyId: string;
  policyNumber: string;
  quoteId: string;
  status: 'POLICY_ISSUED';
  policyStatus: Policy['status'];
  premiumPaid: string;
  currency: string;
  paymentReference: string;
  coverageStart: string;
  coverageEnd: string;
  issuedAt: string;
}

export function toPolicyResponse(p: Policy): PolicyResponse {
  return {
    policyId: p.id,
    policyNumber: p.policyNumber,
    quoteId: p.quoteId,
    status: 'POLICY_ISSUED',
    policyStatus: p.status,
    premiumPaid: p.premiumPaid.toFixed(2),
    currency: p.currency,
    paymentReference: p.paymentReference,
    coverageStart: p.coverageStart.toISOString(),
    coverageEnd: p.coverageEnd.toISOString(),
    issuedAt: p.issuedAt.toISOString(),
  };
}
