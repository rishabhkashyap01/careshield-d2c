import { type ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';

/** Prisma error codes that mean "we couldn't talk to the database", not "bad query". */
const UNAVAILABLE_CODES = new Set([
  'P1001', // can't reach database server
  'P1002', // database server timed out
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'P2024', // timed out fetching a connection from the pool
]);

const DRIVER_MESSAGES =
  /connection terminated|connection timeout|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|Can't reach database server/i;

export function isDatabaseUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (UNAVAILABLE_CODES.has(err.code)) return true;
    // Raw queries surface as P2010 with the driver's reason attached.
    const kind = (
      err.meta as { driverAdapterError?: { cause?: { kind?: string } } }
    )?.driverAdapterError?.cause?.kind;
    return kind === 'DatabaseNotReachable';
  }
  // The pg driver's own connection errors (e.g. connectionTimeoutMillis hit).
  return (
    err instanceof Error &&
    !(err instanceof Prisma.PrismaClientKnownRequestError) &&
    DRIVER_MESSAGES.test(err.message)
  );
}

/**
 * Catch-all filter: database outages become a clear, retryable 503 instead of
 * an anonymous 500. Everything else is handed to Nest's default handling.
 * Registered BEFORE DomainExceptionFilter so the specific filter still wins
 * for domain errors (Nest tries global filters from last to first).
 */
@Catch()
export class DatabaseUnavailableFilter extends BaseExceptionFilter {
  override catch(err: unknown, host: ArgumentsHost): void {
    if (!isDatabaseUnavailable(err)) {
      super.catch(err, host);
      return;
    }
    const res = host.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', '5');
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'ServiceUnavailable',
      message:
        'The service is temporarily unavailable. Please try again shortly.',
    });
  }
}
