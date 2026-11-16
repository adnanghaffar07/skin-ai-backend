import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { auditTarget } from './audit-resource.js';
import { AuditService } from './audit.service.js';

/** Records every authenticated call (reads included) once the response status is known. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const record = (statusCode: number): void => {
      const target = auditTarget(request.originalUrl);
      if (!request.user || !target) {
        return;
      }
      void this.audit.record({
        userId: request.user.id,
        requestId: request.header('x-request-id') ?? null,
        method: request.method,
        resource: target.resource,
        resourceId: target.resourceId,
        statusCode,
      });
    };
    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (error: unknown) =>
          record(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
