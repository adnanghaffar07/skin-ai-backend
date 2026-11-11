import { createHash, randomBytes } from 'node:crypto';

export function newClaimToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashClaimToken(token) };
}

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
