import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

describe('health endpoints (e2e, database up)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live → 200, not cached', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each(['/api/v1/health/ready', '/api/v1/health'])(
    'GET %s → 200 up with latency',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path).expect(200);
      expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
      expect(typeof res.body.latencyMs).toBe('number');
    },
  );
});
