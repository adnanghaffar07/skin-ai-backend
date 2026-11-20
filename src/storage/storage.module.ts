import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStorage } from './object-storage.js';
import { SupabaseStorage } from './supabase-storage.js';
import { UnconfiguredStorage } from './unconfigured-storage.js';

/**
 * Supabase Storage for the private scan-photos bucket. Its secret key comes from SUPABASE_SECRET_KEY when that is set,
 * otherwise from Supabase Vault (secret `scan_photos_secret_key`, read through public.scan_photos_storage_key(), which
 * only the API's database role may call). With neither, every photo call answers 503.
 */
@Global()
@Module({
  providers: [
    {
      provide: ObjectStorage,
      inject: [ConfigService, DatabaseService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>, database: DatabaseService): ObjectStorage => {
        const url = config.get('SUPABASE_URL', { infer: true });
        const key = config.get('SUPABASE_SECRET_KEY', { infer: true });
        if (key) {
          return new SupabaseStorage(url, key);
        }
        if (!config.get('DATABASE_URL', { infer: true })) {
          return new UnconfiguredStorage();
        }
        return new SupabaseStorage(url, async () => {
          const rows = await database.query<{ key: string | null }>('select public.scan_photos_storage_key() as key');
          return rows[0]?.key ?? null;
        });
      },
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
