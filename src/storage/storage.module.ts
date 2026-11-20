import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { ObjectStorage } from './object-storage.js';
import { SupabaseStorage } from './supabase-storage.js';
import { UnconfiguredStorage } from './unconfigured-storage.js';

/** Supabase Storage when SUPABASE_SECRET_KEY is set; otherwise every photo call answers 503. */
@Global()
@Module({
  providers: [
    {
      provide: ObjectStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): ObjectStorage => {
        const key = config.get('SUPABASE_SECRET_KEY', { infer: true });
        return key
          ? new SupabaseStorage(config.get('SUPABASE_URL', { infer: true }), key)
          : new UnconfiguredStorage();
      },
    },
  ],
  exports: [ObjectStorage],
})
export class StorageModule {}
