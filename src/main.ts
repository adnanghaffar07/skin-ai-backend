import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
await bootstrap();
