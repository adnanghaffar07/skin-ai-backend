import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { identityFromPayload } from './identity.js';

@Injectable()
export class JwtVerifier {
  private keys: JWTVerifyGetKey | null = null;
  private issuer: string | null = null;

  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<AuthenticatedUser> {
    const { keys, issuer } = this.settings();
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: 'authenticated',
      });
      return identityFromPayload(payload);
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }
      throw new ApiException(
        401,
        ErrorCode.UNAUTHENTICATED,
        'Missing or invalid access token.',
      );
    }
  }

  private settings(): { keys: JWTVerifyGetKey; issuer: string } {
    if (this.keys && this.issuer) {
      return { keys: this.keys, issuer: this.issuer };
    }
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new ApiException(
        503,
        ErrorCode.INTERNAL_ERROR,
        'Authentication is not configured. Set SUPABASE_URL in .env.',
      );
    }
    const issuer = new URL('/auth/v1', supabaseUrl).toString().replace(/\/$/, '');
    this.issuer = issuer;
    this.keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    return { keys: this.keys, issuer };
  }
}
