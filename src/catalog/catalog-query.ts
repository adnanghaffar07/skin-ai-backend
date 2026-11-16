import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export interface Cursor {
  name: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof value?.name === 'string' && typeof value?.id === 'string') {
      return { name: value.name, id: value.id };
    }
  } catch {
    // falls through to the error below
  }
  throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Invalid cursor.');
}

/** Escapes LIKE wildcards so a search for "100%" matches the text, not everything. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function clampLimit(limit: number | undefined): number {
  if (!limit || limit < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(limit, MAX_LIMIT);
}
