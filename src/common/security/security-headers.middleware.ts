import type { NextFunction, Request, Response } from 'express';

/** Basic hardening headers for a JSON API. Swagger UI (/api/docs) needs inline scripts, so it is skipped. */
export function securityHeaders(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (!request.path.startsWith('/api/docs')) {
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
    // Photos and health data must never be cached by a shared proxy or the browser.
    response.setHeader('Cache-Control', 'no-store');
  }
  next();
}
