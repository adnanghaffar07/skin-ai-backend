import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { createRateLimiter } from './common/security/rate-limit.middleware.js';
import { securityHeaders } from './common/security/security-headers.middleware.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  (app as NestExpressApplication).disable('x-powered-by');
  // Vercel's proxy reports the caller's address; without this every user would share one rate limit.
  if (process.env.VERCEL) {
    (app as NestExpressApplication).set('trust proxy', 1);
  }
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // The mobile app does not use CORS. Outside development it stays off unless origins are listed.
  const corsOrigin =
    origins.length > 0 ? origins : config.get('NODE_ENV') === 'production' ? false : true;
  app.enableCors({
    origin: corsOrigin,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'x-claim-token',
      'Idempotency-Key',
    ],
  });
  const requestIds = new RequestIdMiddleware();
  app.use(requestIds.use.bind(requestIds));
  app.use(securityHeaders);
  const limiter = createRateLimiter(
    config.get<number>('RATE_LIMIT_PER_MINUTE', 120),
  );
  app.use((request: Request, response: Response, next: NextFunction) =>
    limiter.middleware(request, response, next),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swagger = new DocumentBuilder()
    .setTitle('Clara Skin API')
    .setDescription(
      [
        'Mobile REST API for Clara Skin AI.',
        '',
        '**Authorization** does not come from this API. The app signs up or signs in with Supabase Auth and receives `access_token`. Send that token here as `Authorization: Bearer <access_token>`. Click **Authorize** and paste only the token, without the word Bearer.',
        '',
        'Supabase sign-in: `POST https://awhulfitatettoqllejm.supabase.co/auth/v1/token?grant_type=password` with header `apikey: <publishable key>` and body `{ "email", "password" }`. The password never comes to this API.',
        '',
        'Onboarding answers stay on the device. After sign-up, **POST /api/v1/onboarding/form** stores every screen in one request. Vision, RAG, and the agent are not called yet.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Supabase access_token from sign-up or sign-in. Paste the token only.',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  // The bare domain has no content of its own, so visitors land on the API docs.
  const http = app.getHttpAdapter();
  for (const path of ['/', '/api']) {
    http.get(path, (_request: Request, response: Response) =>
      response.redirect('/api/docs'),
    );
  }

  // Vercel does not bundle Swagger UI's static files, so the page loads them from a pinned CDN version.
  const swaggerUi = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.0';
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Clara Skin API',
    customCssUrl: `${swaggerUi}/swagger-ui.css`,
    customJs: [
      `${swaggerUi}/swagger-ui-bundle.js`,
      `${swaggerUi}/swagger-ui-standalone-preset.js`,
    ],
    swaggerOptions: { persistAuthorization: true },
  });
}
