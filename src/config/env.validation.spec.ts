import { DEFAULT_SUPABASE_URL, validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('defaults NODE_ENV and PORT when they are absent', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      SUPABASE_URL: DEFAULT_SUPABASE_URL,
      DATABASE_URL: undefined,
    });
  });

  it('accepts the test environment and a numeric port string', () => {
    expect(validateEnv({ NODE_ENV: 'test', PORT: '4100' })).toEqual({
      NODE_ENV: 'test',
      PORT: 4100,
      SUPABASE_URL: DEFAULT_SUPABASE_URL,
      DATABASE_URL: undefined,
    });
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
});
