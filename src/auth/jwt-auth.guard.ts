import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { OPTIONAL_AUTH_KEY } from './optional-auth.decorator.js';
import { JwtVerifier } from './jwt-verifier.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const optional = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearer(request.header('authorization'));
    if (!token) {
      if (optional) {
        return true;
      }
      throw new ApiException(
        401,
        ErrorCode.UNAUTHENTICATED,
        'Missing or invalid access token.',
      );
    }
    request.user = await this.verifier.verify(token);
    return true;
  }
}

function readBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
