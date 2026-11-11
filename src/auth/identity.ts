import type { JWTPayload } from 'jose';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import type { AuthenticatedUser } from './authenticated-user.js';

export function identityFromPayload(payload: JWTPayload): AuthenticatedUser {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new ApiException(
      401,
      ErrorCode.UNAUTHENTICATED,
      'Missing or invalid access token.',
    );
  }
  const email = typeof payload.email === 'string' ? payload.email : null;
  return {
    id: payload.sub,
    email,
    displayName: readDisplayName(payload),
  };
}

function readDisplayName(payload: JWTPayload): string | null {
  const metadata = payload.user_metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  const value = record.full_name ?? record.name;
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : null;
}
