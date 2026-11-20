import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap(): Promise<void> {
  // rawBody: the Stripe webhook checks its signature against the exact bytes Stripe sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  const database = config.get<string>('DATABASE_URL')
    ? 'database configured'
    : 'database not configured';
  Logger.log(
    `API listening on port ${port}. ${database}. Swagger path: /api/docs`,
    'Bootstrap',
  );
}

// Not awaited at the top level: Vercel finishes loading this file before it lets the server start listening.
bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Bootstrap');
  process.exit(1);
});
