import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { QuoteExpiredError } from '../insurance/domain/quote-state-machine.js';
import { isDatabaseUnavailable } from './database-unavailable.filter.js';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: '7',
    meta,
  });

describe('isDatabaseUnavailable', () => {
  it.each([
    ['P1001 cannot reach server', known('P1001')],
    ['P1002 server timed out', known('P1002')],
    ['P1017 connection closed', known('P1017')],
    ['P2024 pool timeout', known('P2024')],
    [
      'raw query, driver says DatabaseNotReachable',
      known('P2010', {
        driverAdapterError: { cause: { kind: 'DatabaseNotReachable' } },
      }),
    ],
    [
      'initialization error',
      new Prisma.PrismaClientInitializationError('boom', '7'),
    ],
    [
      'pg connect timeout',
      new Error('Connection terminated due to connection timeout'),
    ],
    ['connection refused', new Error('connect ECONNREFUSED 127.0.0.1:5432')],
  ])('true for %s', (_l, err) => {
    expect(isDatabaseUnavailable(err)).toBe(true);
  });

  it.each([
    ['unique violation P2002', known('P2002')],
    ['record not found P2025', known('P2025')],
    [
      'raw query failure with a different cause',
      known('P2010', {
        driverAdapterError: { cause: { kind: 'CheckViolation' } },
      }),
    ],
    ['Nest NotFoundException', new NotFoundException()],
    ['domain error', new QuoteExpiredError('q', new Date())],
    ['ordinary bug', new TypeError('x is undefined')],
    ['non-error value', 'oops'],
  ])('false for %s', (_l, err) => {
    expect(isDatabaseUnavailable(err)).toBe(false);
  });
});
