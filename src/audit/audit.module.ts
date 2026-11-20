import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminGuard } from '../auth/admin.guard.js';
import { AdminAuditController, AdminAuditService } from './admin-audit.controller.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

@Global()
@Module({
  controllers: [AdminAuditController],
  providers: [
    AuditService,
    AdminAuditService,
    AdminGuard,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
