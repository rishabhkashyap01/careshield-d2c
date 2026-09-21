import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { IdempotencyStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Db } from '../quotes.repository.js';

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * An IN_PROGRESS key older than this cannot belong to a live request: the
 * checkout transaction times out after 20 s, and a committed one marks the key
 * COMPLETED in the same transaction. So it was left behind by an attempt that
 * rolled back but couldn't release the key (e.g. the DB dropped mid-request),
 * and a retry may safely take it over.
 */
export const STALE_IN_PROGRESS_MS = 60_000;

/** Same key, different request body → client bug; refuse rather than guess. */
export class IdempotencyKeyReusedError extends Error {
  constructor(readonly key: string) {
    super('This Idempotency-Key was already used for a different request.');
    this.name = 'IdempotencyKeyReusedError';
  }
}

/** Another request with this key is running right now. */
export class IdempotencyInProgressError extends Error {
  constructor(readonly key: string) {
    super('A payment with this Idempotency-Key is already being processed.');
    this.name = 'IdempotencyInProgressError';
  }
}

export type Claim =
  | { kind: 'owned' }
  | { kind: 'replay'; status: number; body: Prisma.JsonValue };

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/**
 * Task 4.2 — Idempotency-Key handling.
 *
 *  claim()     INSERT the key as IN_PROGRESS. The (scope, key) primary key makes
 *              this atomic: exactly one concurrent request wins.
 *  complete()  store the response — called INSIDE the checkout transaction, so
 *              "policy issued" and "key completed" commit or roll back together.
 *  release()   mark FAILED after a rollback so a retry with the same key runs again.
 *              If even that fails (DB gone), the key is reclaimable once stale.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(
    scope: string,
    key: string,
    requestHash: string,
    quoteId: string,
    now = new Date(),
  ): Promise<Claim> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          scope,
          key,
          requestHash,
          quoteId,
          status: IdempotencyStatus.IN_PROGRESS,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });
      return { kind: 'owned' };
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== 'P2002'
      ) {
        throw err;
      }
    }

    const existing = await this.prisma.idempotencyKey.findUniqueOrThrow({
      where: { scope_key: { scope, key } },
    });
    if (existing.requestHash !== requestHash)
      throw new IdempotencyKeyReusedError(key);

    switch (existing.status) {
      case IdempotencyStatus.COMPLETED:
        return {
          kind: 'replay',
          status: existing.responseStatus!,
          body: existing.responseBody!,
        };
      case IdempotencyStatus.IN_PROGRESS: {
        if (
          now.getTime() - existing.updatedAt.getTime() <
          STALE_IN_PROGRESS_MS
        ) {
          throw new IdempotencyInProgressError(key);
        }
        // Abandoned claim — take it over, atomically (only one retry can win).
        const { count } = await this.prisma.idempotencyKey.updateMany({
          where: {
            scope,
            key,
            status: IdempotencyStatus.IN_PROGRESS,
            updatedAt: existing.updatedAt,
          },
          data: { status: IdempotencyStatus.IN_PROGRESS, updatedAt: now },
        });
        if (count === 1) return { kind: 'owned' };
        throw new IdempotencyInProgressError(key);
      }
      case IdempotencyStatus.FAILED: {
        // A previous attempt rolled back. Re-claim it — atomically, so two
        // simultaneous retries can't both proceed.
        const { count } = await this.prisma.idempotencyKey.updateMany({
          where: { scope, key, status: IdempotencyStatus.FAILED },
          data: { status: IdempotencyStatus.IN_PROGRESS },
        });
        if (count === 1) return { kind: 'owned' };
        throw new IdempotencyInProgressError(key);
      }
    }
  }

  async complete(
    db: Db,
    scope: string,
    key: string,
    responseStatus: number,
    responseBody: Prisma.InputJsonValue,
  ): Promise<void> {
    await db.idempotencyKey.update({
      where: { scope_key: { scope, key } },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus,
        responseBody,
      },
    });
  }

  async release(scope: string, key: string): Promise<void> {
    await this.prisma.idempotencyKey.updateMany({
      where: { scope, key, status: IdempotencyStatus.IN_PROGRESS },
      data: { status: IdempotencyStatus.FAILED },
    });
  }
}
