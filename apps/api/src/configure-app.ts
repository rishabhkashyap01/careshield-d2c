import type { INestApplication } from '@nestjs/common';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { strictValidationPipe } from './common/validation.js';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(strictValidationPipe());
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    methods: ['GET', 'POST'],
  });
  app.enableShutdownHooks();
  return app;
}
