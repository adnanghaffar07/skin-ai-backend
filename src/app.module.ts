import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ConsentsModule } from './consents/consents.module.js';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { PreferencesModule } from './preferences/preferences.module.js';
import { ScansModule } from './scans/scans.module.js';
import { StorageModule } from './storage/storage.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { RecommendationsModule } from './recommendations/recommendations.module.js';
import { RoutinesModule } from './routines/routines.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    AuditModule,
    HealthModule,
    UsersModule,
    ConsentsModule,
    PreferencesModule,
    OnboardingModule,
    StorageModule,
    ScansModule,
    CatalogModule,
    RecommendationsModule,
    RoutinesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
