import { describe, expect, it } from 'vitest';
import { isSupabaseHost, withoutSslParams } from './database.service.js';

describe('database connection settings', () => {
  it('drops SSL parameters from the URL so the pool options decide, and keeps the rest', () => {
    expect(
      withoutSslParams('postgresql://clara_api.ref:p4ss@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&application_name=clara'),
    ).toBe('postgresql://clara_api.ref:p4ss@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?application_name=clara');
    expect(withoutSslParams('postgresql://u:p@localhost:5432/db')).toBe('postgresql://u:p@localhost:5432/db');
  });

  it('recognises both the direct Supabase host and the pooler', () => {
    expect(isSupabaseHost('postgresql://u:p@db.abc.supabase.co:5432/postgres')).toBe(true);
    expect(isSupabaseHost('postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres')).toBe(true);
    expect(isSupabaseHost('postgresql://u:p@localhost:5432/db')).toBe(false);
  });
});
