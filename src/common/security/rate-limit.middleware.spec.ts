import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './rate-limit.middleware.js';

function call(
  limiter: ReturnType<typeof createRateLimiter>,
  path = '/api/v1/me',
  ip = '1.1.1.1',
) {
  const next = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn();
  const response = {
    setHeader,
    status: vi.fn().mockReturnValue({ json }),
  } as unknown as Response;
  const request = { path, ip, header: () => 'rid' } as unknown as Request;
  limiter.middleware(request, response, next);
  return { next, json, setHeader };
}

describe('rate limiter', () => {
  it('allows requests up to the limit then answers 429', () => {
    let time = 0;
    const limiter = createRateLimiter(2, 1000, () => time);
    expect(call(limiter).next).toHaveBeenCalled();
    expect(call(limiter).next).toHaveBeenCalled();
    const blocked = call(limiter);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 429, code: 'RATE_LIMITED' }),
    );
    expect(blocked.setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });

  it('starts a new window after the time passes', () => {
    let time = 0;
    const limiter = createRateLimiter(1, 1000, () => time);
    call(limiter);
    expect(call(limiter).next).not.toHaveBeenCalled();
    time = 1001;
    expect(call(limiter).next).toHaveBeenCalled();
  });

  it('counts each client separately', () => {
    const limiter = createRateLimiter(1, 1000, () => 0);
    call(limiter, '/api/v1/me', '1.1.1.1');
    expect(call(limiter, '/api/v1/me', '2.2.2.2').next).toHaveBeenCalled();
  });

  it('never limits the health check', () => {
    const limiter = createRateLimiter(1, 1000, () => 0);
    for (let i = 0; i < 5; i += 1) {
      expect(call(limiter, '/api/v1/health').next).toHaveBeenCalled();
    }
  });
});
