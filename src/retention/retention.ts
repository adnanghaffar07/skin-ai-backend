import { createHash, timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, HttpCode, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { AlertsService } from '../alerts/alerts.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ProductImagesService } from '../catalog/product-images.js';

/**
 * Automatic deletion after a retention period (compliance plan: "Nothing deletes old photos or scans today").
 * Every period is off until it is set, because how long to keep data is the business's decision:
 *   RETENTION_PHOTO_DAYS  training photos (scan-photos bucket) and their records
 *   RETENTION_SCAN_DAYS   scan readings synced from the app (scan_results)
 *   RETENTION_LOG_DAYS    audit log and app analytics events
 * Vercel Cron calls GET /api/v1/cron/daily once a day with "Authorization: Bearer <CRON_SECRET>". The same daily job copies
 * new product photos into Clara storage and emails the daily check (AlertsService).
 */
export type RetentionSettings = { photoDays?: number; scanDays?: number; logDays?: number };
export type RetentionResult = { photos: number; photo_files_failed: number; scan_results: number; audit_events: number; analytics_events: number; skipped: string[] };

const BATCH = 500;

const days = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : undefined;
};

export function retentionSettings(read: (key: string) => unknown): RetentionSettings {
  return { photoDays: days(read('RETENTION_PHOTO_DAYS')), scanDays: days(read('RETENTION_SCAN_DAYS')), logDays: days(read('RETENTION_LOG_DAYS')) };
}

/** Compares secrets without leaking how much of them matched. */
export function sameSecret(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) {
    return false;
  }
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger('Retention');

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorage,
  ) {}

  async run(settings: RetentionSettings): Promise<RetentionResult> {
    const result: RetentionResult = { photos: 0, photo_files_failed: 0, scan_results: 0, audit_events: 0, analytics_events: 0, skipped: [] };

    if (settings.photoDays) {
      const old = await this.database.query<{ scan_id: string; object_key: string }>(
        `select scan_id, object_key from public.scan_images
         where created_at < now() - make_interval(days => $1) order by created_at limit ${BATCH}`,
        [settings.photoDays],
      );
      for (const photo of old) {
        try {
          await this.storage.delete(photo.object_key);
        } catch (error) {
          // The record goes anyway: a file left behind is retried by nobody, so it is counted and logged instead.
          result.photo_files_failed += 1;
          this.logger.warn(`photo file not deleted: ${String(error)}`);
        }
        await this.database.query('delete from public.scan_images where scan_id = $1', [photo.scan_id]);
        result.photos += 1;
      }
    } else {
      result.skipped.push('photos');
    }

    if (settings.scanDays) {
      const rows = await this.database.query('delete from public.scan_results where analysed_at < now() - make_interval(days => $1) returning 1', [settings.scanDays]);
      result.scan_results = rows.length;
    } else {
      result.skipped.push('scan_results');
    }

    if (settings.logDays) {
      const audit = await this.database.query('delete from public.audit_events where created_at < now() - make_interval(days => $1) returning 1', [settings.logDays]);
      const events = await this.database.query('delete from public.analytics_events where occurred_at < now() - make_interval(days => $1) returning 1', [settings.logDays]);
      result.audit_events = audit.length;
      result.analytics_events = events.length;
    } else {
      result.skipped.push('logs');
    }

    this.logger.log(`retention run: ${JSON.stringify(result)}`);
    return result;
  }
}

@ApiExcludeController()
@Public()
@Controller('cron')
export class RetentionController {
  constructor(
    private readonly retention: RetentionService,
    private readonly config: ConfigService,
    private readonly images: ProductImagesService,
    private readonly alerts: AlertsService,
  ) {}

  /** The once-a-day job: retention, then product photos, then the daily check email. One part failing does not stop the rest. */
  @Get('daily')
  @HttpCode(200)
  async run(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    const secret = this.config.get<string>('CRON_SECRET');
    // Without a secret the job is off, and the route looks like it does not exist.
    if (!secret) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Not found.');
    }
    if (!sameSecret(authorization?.replace(/^Bearer /, ''), secret)) {
      throw new ApiException(401, ErrorCode.UNAUTHENTICATED, 'Not allowed.');
    }
    const part = async <T>(name: string, work: () => Promise<T>): Promise<T | { error: string }> => {
      try {
        return await work();
      } catch (error) {
        return { error: `${name} failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    };
    return {
      retention: await part('retention', () => this.retention.run(retentionSettings(key => this.config.get(key)))),
      product_images: await part('product images', () => this.images.copy(200)),
      daily_check: await part('daily check', () => this.alerts.dailySummary()),
    };
  }
}

@Module({
  imports: [CatalogModule],
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
