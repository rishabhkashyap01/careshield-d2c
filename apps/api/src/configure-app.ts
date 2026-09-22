import type { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DatabaseUnavailableFilter } from './common/database-unavailable.filter.js';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';
import { requestIdMiddleware } from './common/request-meta.js';
import { strictValidationPipe } from './common/validation.js';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');
  app.use(requestIdMiddleware);
  app.useGlobalPipes(strictValidationPipe());
  app.useGlobalFilters(
    new DatabaseUnavailableFilter(app.get(HttpAdapterHost).httpAdapter),
    new DomainExceptionFilter(),
  );
  app.enableShutdownHooks();
  return app;
}
