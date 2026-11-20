import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
  });

  it.each(['/', '/api'])('%s redirects to the API docs', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .expect(302)
      .expect('Location', '/api/docs');
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          status: 'ok',
          service: 'skincare-api',
        });
        expect(response.headers['x-request-id']).toEqual(expect.any(String));
      });
  });

  it('requires a bearer token for the profile', () => {
    return request(app.getHttpServer())
      .get('/api/v1/me')
      .set('x-request-id', 'req_me')
      .expect(401)
      .expect((response) => {
        expect(response.body).toEqual({
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          message: 'Missing or invalid access token.',
          details: [],
          requestId: 'req_me',
        });
      });
  });

  it('lets a guest browse products without a token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/products?market=US')
      .expect((response) => {
        // No database in this test, so the call cannot succeed, but it must get past the login check.
        expect(response.status).not.toBe(401);
      });
  });

  it('asks a guest for a market', () => {
    return request(app.getHttpServer())
      .get('/api/v1/products')
      .expect(422)
      .expect((response) => {
        expect(response.body.code).toBe('MARKET_REQUIRED');
      });
  });

  it('lists the phase 1 routes in the OpenAPI document', () => {
    return request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200)
      .expect((response) => {
        expect(response.body.info.title).toBe('Clara Skin API');
        expect(Object.keys(response.body.paths)).toEqual(
          expect.arrayContaining([
            '/api/v1/health',
            '/api/v1/me',
            '/api/v1/me/preferences',
            '/api/v1/consents',
            '/api/v1/questionnaires/onboarding/active',
            '/api/v1/onboarding/form',
          ]),
        );
      });
  });

  it('returns the shared error shape for an unknown route', () => {
    return request(app.getHttpServer())
      .get('/api/v1/missing')
      .set('x-request-id', 'req_missing')
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: expect.any(String),
          details: [],
          requestId: 'req_missing',
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
