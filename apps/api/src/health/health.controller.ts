import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

export interface LivenessResponse {
  status: 'ok';
  uptimeSeconds: number;
}

export interface ReadinessResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down' | 'timeout';
  latencyMs: number;
}

const TIMED_OUT = Symbol('timeout');

/**
 * Two different questions, two endpoints:
 *
 *  GET /health/live   "Is the process running?" Never touches the database, so
 *                     a DB outage doesn't make an orchestrator restart healthy
 *                     API servers in a loop.
 *  GET /health/ready  "Can it serve requests right now?" Runs SELECT 1 with a
 *                     hard timeout, so an unreachable DB is reported as 503
 *                     within ~2 s instead of hanging. Use this to route traffic.
 *  GET /health        Alias of /ready (kept for existing callers).
 */
@Controller('health')
export class HealthController {
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeoutMs = Number(config.get('HEALTH_DB_TIMEOUT_MS') ?? 2000);
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): LivenessResponse {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Get(['', 'ready'])
  @Header('Cache-Control', 'no-store')
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const started = Date.now();
    let database: ReadinessResponse['database'] = 'up';

    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), this.timeoutMs);
        }),
      ]);
      if (result === TIMED_OUT) database = 'timeout';
    } catch {
      database = 'down';
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = Date.now() - started;
    if (database !== 'up') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', database, latencyMs };
    }
    return { status: 'ok', database, latencyMs };
  }
}
