import { Injectable } from '@nestjs/common';
import type { Policy, Quote } from '../../generated/prisma/client.js';
import type { Db } from '../quotes.repository.js';
import type { ChargeResult } from './payment-gateway.js';

/** Creates the policy row. Kept separate so tests can inject a mid-way failure. */
@Injectable()
export class PolicyIssuer {
  async issue(
    db: Db,
    quote: Quote,
    charge: ChargeResult,
    now: Date,
  ): Promise<Policy> {
    const [{ n }] = await db.$queryRaw<
      { n: bigint }[]
    >`SELECT nextval('policy_number_seq') AS n`;
    const policyNumber = `CSM-${now.getUTCFullYear()}-${String(n).padStart(6, '0')}`;

    const coverageStart = now;
    const coverageEnd = new Date(now);
    coverageEnd.setUTCFullYear(coverageEnd.getUTCFullYear() + 1); // 12 months of cover

    return db.policy.create({
      data: {
        policyNumber,
        quoteId: quote.id,
        premiumPaid: quote.totalPremium,
        currency: quote.currency,
        paymentReference: charge.reference,
        coverageStart,
        coverageEnd,
        issuedAt: now,
      },
    });
  }
}
