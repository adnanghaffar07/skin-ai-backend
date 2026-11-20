import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

/**
 * Lets only Clara's team through. The role is read from the database on every request (never from the token or the
 * app), so taking someone's admin role away works straight away. Runs after the global sign-in check.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new ApiException(401, ErrorCode.UNAUTHENTICATED, 'Sign in first.');
    }
    const rows = await this.database.query<{ role: string; status: string; deleted_at: Date | null }>(
      `select role::text as role, status::text as status, deleted_at from public.users where id = $1`,
      [request.user.id],
    );
    const user = rows[0];
    if (!user || user.role !== 'admin' || user.status !== 'active' || user.deleted_at) {
      throw new ApiException(403, ErrorCode.FORBIDDEN, 'This is only for the Clara team.');
    }
    return true;
  }
}
