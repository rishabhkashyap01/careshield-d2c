import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

function controller(queryRaw: () => Promise<unknown>, timeoutMs = 100) {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const config = { get: () => timeoutMs } as unknown as ConfigService;
  return new HealthController(prisma, config);
}

function fakeRes() {
  const res = {
    statusCode: 200,
    status: vi.fn((c: number) => ((res.statusCode = c), res)),
  };
  return res as unknown as Response & { statusCode: number };
}

describe('HealthController', () => {
  it('live never touches the database', () => {
    const queryRaw = vi.fn();
    const body = controller(queryRaw).live();
    expect(body.status).toBe('ok');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('ready → 200 up when SELECT 1 succeeds', async () => {
    const res = fakeRes();
    const body = await controller(async () => [{ '?column?': 1 }]).ready(res);
    expect(body).toMatchObject({ status: 'ok', database: 'up' });
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ready → 503 down when the query fails', async () => {
    const res = fakeRes();
    const body = await controller(async () => {
      throw new Error("Can't reach database server");
    }).ready(res);
    expect(body).toMatchObject({ status: 'error', database: 'down' });
    expect(res.statusCode).toBe(503);
  });

  it('ready → 503 timeout (instead of hanging) when the query never returns', async () => {
    const res = fakeRes();
    const started = Date.now();
    const body = await controller(() => new Promise(() => {}), 100).ready(res);
    expect(body).toMatchObject({ status: 'error', database: 'timeout' });
    expect(res.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
