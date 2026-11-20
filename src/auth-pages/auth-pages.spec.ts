import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthPagesController } from './auth-pages.controller.js';

function capture() {
  const headers: Record<string, string> = {};
  let html = '';
  const response = {
    locals: {},
    setHeader: (name: string, value: string) => (headers[name] = value),
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: (body: string) => (html = body),
  };
  return { response: response as unknown as Response, headers, html: () => html };
}

const config = { get: (key: string) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })[key] };

describe('AuthPagesController', () => {
  it('lets only its own script run, and only talks to Supabase on the reset page', () => {
    const pages = new AuthPagesController(config as unknown as ConfigService);
    const reset = capture();
    pages.resetPassword(reset.response);
    const nonce = /nonce="([^"]+)"/.exec(reset.html())![1];
    expect(reset.headers['Content-Security-Policy']).toContain(`script-src 'nonce-${nonce}'`);
    expect(reset.headers['Content-Security-Policy']).toContain('connect-src https://x.supabase.co');
    expect(reset.html()).toContain('"sb_publishable_test"');

    const confirmed = capture();
    pages.confirmed(confirmed.response);
    expect(confirmed.headers['Content-Security-Policy']).not.toContain('connect-src');
    expect(/nonce="([^"]+)"/.exec(confirmed.html())![1]).not.toBe(nonce);
  });
});
