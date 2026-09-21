import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    super({
      adapter: new PrismaPg({
        connectionString,
        // Without this, an unreachable DB host (network outage, firewall that
        // drops packets) makes every query — and the health check — hang
        // forever instead of failing.
        connectionTimeoutMillis: Number(
          config.get('DB_CONNECT_TIMEOUT_MS') ?? 5000,
        ),
        // Connections per instance. Keep this small on serverless, where
        // many instances can run at once (set DB_POOL_MAX=3 on Vercel).
        max: Number(config.get('DB_POOL_MAX') ?? 10),
      }),
    });
  }

  /** Connects lazily: the API still starts (and reports "not ready") if the DB is down. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
