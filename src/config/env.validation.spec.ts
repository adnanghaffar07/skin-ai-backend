import { DEFAULT_SUPABASE_URL, validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('defaults NODE_ENV and PORT when they are absent', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      SUPABASE_URL: DEFAULT_SUPABASE_URL,
      DATABASE_URL: undefined,
      DATABASE_SSL_CA: undefined,
      CORS_ORIGINS: undefined,
      RATE_LIMIT_PER_MINUTE: 120,
      AI_SERVICE_MODE: 'off',
      AI_SERVICE_URL: undefined,
      AI_SERVICE_KEY: undefined,
      AI_TIMEOUT_MS: 30000,
      PRICE_MARKUP_PERCENT: 8.5,
      PAYMENTS_MODE: 'off',
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      PUBLIC_BASE_URL: 'https://clara-skin-api.vercel.app',
    });
  });

  it('accepts the test environment and a numeric port string', () => {
    expect(validateEnv({ NODE_ENV: 'test', PORT: '4100' })).toEqual({
      NODE_ENV: 'test',
      PORT: 4100,
      SUPABASE_URL: DEFAULT_SUPABASE_URL,
      DATABASE_URL: undefined,
      DATABASE_SSL_CA: undefined,
      CORS_ORIGINS: undefined,
      RATE_LIMIT_PER_MINUTE: 120,
      AI_SERVICE_MODE: 'off',
      AI_SERVICE_URL: undefined,
      AI_SERVICE_KEY: undefined,
      AI_TIMEOUT_MS: 30000,
      PRICE_MARKUP_PERCENT: 8.5,
      PAYMENTS_MODE: 'off',
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      PUBLIC_BASE_URL: 'https://clara-skin-api.vercel.app',
    });
  });

  it('reads the rate limit and CORS origins', () => {
    const env = validateEnv({ RATE_LIMIT_PER_MINUTE: '30', CORS_ORIGINS: 'https://a.test' });
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(30);
    expect(env.CORS_ORIGINS).toBe('https://a.test');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('rejects a port outside 1-65535', () => {
    expect(() => validateEnv({ PORT: '0' })).toThrow(
      /Environment validation failed/,
    );
    expect(() => validateEnv({ PORT: 'not-a-port' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('uses the AI service when its address is set', () => {
    const env = validateEnv({ AI_SERVICE_URL: 'https://ai.example.com', AI_SERVICE_KEY: 'secret', PRICE_MARKUP_PERCENT: '10' });
    expect(env.AI_SERVICE_MODE).toBe('http');
    expect(env.PRICE_MARKUP_PERCENT).toBe(10);
  });

  it('needs a key to call the AI service', () => {
    expect(() => validateEnv({ AI_SERVICE_URL: 'https://ai.example.com' })).toThrow(/AI_SERVICE_KEY/);
  });

  it('refuses a plain-http AI service', () => {
    expect(() => validateEnv({ AI_SERVICE_URL: 'http://ai.example.com', AI_SERVICE_KEY: 'secret' })).toThrow(/Environment validation failed/);
  });

  it('never allows the stand-in AI in production', () => {
    expect(validateEnv({ AI_SERVICE_MODE: 'stub' }).AI_SERVICE_MODE).toBe('stub');
    expect(() => validateEnv({ AI_SERVICE_MODE: 'stub', NODE_ENV: 'production' })).toThrow(/not allowed in production/);
  });

  it('rejects a markup outside 0-100 percent', () => {
    expect(() => validateEnv({ PRICE_MARKUP_PERCENT: '-1' })).toThrow(/Environment validation failed/);
    expect(() => validateEnv({ PRICE_MARKUP_PERCENT: '150' })).toThrow(/Environment validation failed/);
  });

  it('turns checkout on only with both Stripe keys', () => {
    expect(validateEnv({}).PAYMENTS_MODE).toBe('off');
    expect(() => validateEnv({ STRIPE_SECRET_KEY: 'sk_test_x' })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() => validateEnv({ PAYMENTS_MODE: 'stripe', STRIPE_WEBHOOK_SECRET: 'whsec_x' })).toThrow(/STRIPE_SECRET_KEY/);
    expect(validateEnv({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }).PAYMENTS_MODE).toBe('stripe');
    expect(validateEnv({ PAYMENTS_MODE: 'off', STRIPE_SECRET_KEY: 'sk_test_x' }).PAYMENTS_MODE).toBe('off');
  });
});
