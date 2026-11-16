import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '../filters/error-codes.js';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  middleware(request: Request, response: Response, next: NextFunction): void;
  size(): number;
}

/**
 * Fixed-window limiter kept in memory, per client IP. It is per server process, which is
 * enough for the single API server. Behind several instances use a shared store instead.
 */
export function createRateLimiter(
  limit: number,
  windowMs = 60_000,
  now: () => number = Date.now,
): RateLimiter {
  const buckets = new Map<string, Bucket>();

  const sweep = (): void => {
    const time = now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= time) {
        buckets.delete(key);
      }
    }
  };
  setInterval(sweep, windowMs).unref();

  return {
    size: () => buckets.size,
    middleware(request, response, next) {
      if (request.path.endsWith('/health')) {
        next();
        return;
      }
      const key = request.ip ?? 'unknown';
      const time = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= time) {
        bucket = { count: 0, resetAt: time + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (bucket.count > limit) {
        const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - time) / 1000));
        response.setHeader('Retry-After', String(retryAfter));
        response.status(429).json({
          statusCode: 429,
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Try again shortly.',
          details: [],
          requestId: request.header('x-request-id') ?? '',
        });
        return;
      }
      next();
    },
  };
}
