import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('App bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await NestFactory.create(AppModule, { bufferLogs: true });
    configureApp(app);
  });

  it('GET / returns 404 (no root route)', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });

  it('GET /api/docs serves Swagger UI', () => {
    return request(app.getHttpServer()).get('/api/docs').expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
