import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (
    data: { optional?: boolean } | undefined,
    context: ExecutionContext,
  ): AuthenticatedUser | null => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user && !data?.optional) {
      throw new ApiException(
        401,
        ErrorCode.UNAUTHENTICATED,
        'Missing or invalid access token.',
      );
    }
    return request.user ?? null;
  },
);
