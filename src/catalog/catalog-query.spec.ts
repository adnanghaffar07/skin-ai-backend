import { describe, expect, it } from 'vitest';
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  likePattern,
  MAX_LIMIT,
} from './catalog-query.js';

describe('catalog query helpers', () => {
  it('round-trips a cursor', () => {
    const cursor = { name: 'Gentle Cleanser', id: 'abc' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });
  it('treats a missing cursor as the first page', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });
  it('rejects a garbage cursor with 400', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow();
  });
  it('escapes LIKE wildcards in search text', () => {
    expect(likePattern('100%_x')).toBe('%100\\%\\_x%');
  });
  it('clamps the page size', () => {
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit(9999)).toBe(MAX_LIMIT);
    expect(clampLimit(5)).toBe(5);
  });
});
