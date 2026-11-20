import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConnectionOptions } from 'node:tls';
import pg from 'pg';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';

const { Pool } = pg;

const SSL_PARAMS = ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'];

/** The URL without SSL query parameters, so the ssl option passed to the pool is the one that applies. */
export function withoutSslParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    SSL_PARAMS.forEach((param) => url.searchParams.delete(param));
    return url.toString();
  } catch {
    return connectionString;
  }
}

/** Supabase's direct database host (db.<ref>.supabase.co) or its pooler (<region>.pooler.supabase.com). */
export function isSupabaseHost(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host.endsWith('.supabase.co') || host.endsWith('.supabase.com');
  } catch {
    return /\.supabase\.(co|com)[:/]/.test(connectionString);
  }
}

export interface Queryable {
  query<T extends pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
}

@Injectable()
export class DatabaseService implements Queryable, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: pg.Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  async query<T extends pg.QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.getPool().query<T>(sql, params);
    return result.rows;
  }

  async transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
    const client = await this.getPool().connect();
    const db: Queryable = {
      query: async (sql, params = []) => {
        const result = await client.query(sql, params);
        return result.rows;
      },
    };
    try {
      await client.query('begin');
      const value = await fn(db);
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }

  /**
   * With DATABASE_SSL_CA the certificate is verified. Without it Supabase connections (the direct db.<ref>.supabase.co
   * host and the <region>.pooler.supabase.com pooler) stay encrypted but unverified.
   */
  private sslOptions(connectionString: string): ConnectionOptions | undefined {
    const ca = this.config.get<string>('DATABASE_SSL_CA');
    if (ca) {
      return { ca, rejectUnauthorized: true };
    }
    return isSupabaseHost(connectionString) ? { rejectUnauthorized: false } : undefined;
  }

  private getPool(): pg.Pool {
    if (this.pool) {
      return this.pool;
    }
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new ApiException(
        503,
        ErrorCode.INTERNAL_ERROR,
        'Database is not configured. Set DATABASE_URL in .env.',
      );
    }
    this.pool = new Pool({
      // SSL settings in the URL (sslmode=...) would override the ones below and, in pg 8, demand full verification
      // against Node's default certificates, which Supabase's pooler does not chain to. The options below decide.
      connectionString: withoutSslParams(connectionString),
      // Each Vercel instance keeps few connections, so many instances cannot exhaust the database pooler.
      max: process.env.VERCEL ? 3 : 10,
      ssl: this.sslOptions(connectionString),
    });
    this.pool.on('error', (error) => {
      this.logger.error(error.message);
    });
    return this.pool;
  }
}
