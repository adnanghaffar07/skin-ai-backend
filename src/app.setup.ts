import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';

export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'x-claim-token',
    ],
  });
  const requestIds = new RequestIdMiddleware();
  app.use(requestIds.use.bind(requestIds));
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

  const config = new DocumentBuilder()
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
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
