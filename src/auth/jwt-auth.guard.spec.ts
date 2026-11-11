import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { OPTIONAL_AUTH_KEY } from './optional-auth.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtVerifier } from './jwt-verifier.js';

describe('JwtAuthGuard', () => {
  const verifier = {
    verify: vi.fn(),
  };

  function guardFor(flags: { isPublic?: boolean; optional?: boolean }) {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === IS_PUBLIC_KEY) {
          return flags.isPublic ?? false;
        }
        if (key === OPTIONAL_AUTH_KEY) {
          return flags.optional ?? false;
        }
        return false;
      },
    } as unknown as Reflector;
    return new JwtAuthGuard(reflector, verifier as unknown as JwtVerifier);
  }

  function context(authorization?: string) {
    const request: { header: (name: string) => string | undefined; user?: unknown } = {
      header: (name) => (name === 'authorization' ? authorization : undefined),
    };
    return {
      ctx: {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      } as ExecutionContext,
      request,
    };
  }

  it('allows a public route without a token', async () => {
    const { ctx } = context();
    await expect(guardFor({ isPublic: true }).canActivate(ctx)).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a protected route without a token', async () => {
    const { ctx } = context();
    await expect(guardFor({}).canActivate(ctx)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('allows an optional route without a token', async () => {
    const { ctx, request } = context();
    await expect(guardFor({ optional: true }).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('attaches the verified user', async () => {
    const user = { id: 'user-1', email: null, displayName: null };
    verifier.verify.mockResolvedValue(user);
    const { ctx, request } = context('Bearer token-1');
    await expect(guardFor({}).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(user);
  });
});
