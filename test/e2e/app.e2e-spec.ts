import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createE2eApplication } from '../helpers/test-app';
import { truncateAppTables } from '../helpers/truncate-app-tables';

describe('App bootstrap (e2e)', () => {
  let app: INestApplication | undefined;

  beforeEach(async () => {
    app = await createE2eApplication();
  });

  it('GET / returns 404 (no root route)', () => {
    return request(app!.getHttpServer()).get('/').expect(404);
  });

  it('GET /api/docs serves Swagger UI', () => {
    return request(app!.getHttpServer()).get('/api/docs').expect(200);
  });

  afterEach(async () => {
    truncateAppTables();
    if (app !== undefined) {
      await app.close();
    }
  });
});
