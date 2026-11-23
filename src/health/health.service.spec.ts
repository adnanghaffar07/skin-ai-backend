import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports the process as ok, with no commit and the AI off when nothing is set', () => {
    expect(new HealthService().getHealth({})).toEqual({ status: 'ok', service: 'skincare-api', commit: null, ai: 'off', payments: 'off', email: 'off' });
  });

  it('reports the commit and that the AI is on, without its address or key', () => {
    const health = new HealthService().getHealth({
      VERCEL_GIT_COMMIT_SHA: '401e0f3abcdef',
      AI_SERVICE_URL: 'https://ai.example.com',
      AI_SERVICE_KEY: 'secret',
    });
    expect(health).toMatchObject({ status: 'ok', service: 'skincare-api', commit: '401e0f3', ai: 'on' });
    expect(JSON.stringify(health)).not.toContain('secret');
    expect(JSON.stringify(health)).not.toContain('example.com');
  });

  it('respects an explicit AI_SERVICE_MODE', () => {
    expect(new HealthService().getHealth({ AI_SERVICE_MODE: 'off', AI_SERVICE_URL: 'https://ai.example.com' }).ai).toBe('off');
  });
  it('says whether payments use test or live keys, and whether email is on, without the keys', () => {
    expect(new HealthService().getHealth({ STRIPE_SECRET_KEY: 'sk_test_secret', RESEND_API_KEY: 're_secret' })).toMatchObject({ payments: 'test', email: 'on' });
    const live = new HealthService().getHealth({ STRIPE_SECRET_KEY: 'sk_live_secret', PAYMENTS_MODE: 'stripe' });
    expect(live).toMatchObject({ payments: 'live', email: 'off' });
    expect(JSON.stringify(live)).not.toContain('secret');
    expect(new HealthService().getHealth({ STRIPE_SECRET_KEY: 'sk_live_x', PAYMENTS_MODE: 'off' }).payments).toBe('off');
  });
});
