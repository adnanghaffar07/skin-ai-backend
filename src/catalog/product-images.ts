import { Controller, HttpCode, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import { DatabaseService } from '../database/database.service.js';
import { ProductImageStorage } from '../storage/object-storage.js';

/**
 * Copies catalogue photos from brand and store websites into Clara's own public bucket (product-images), so a photo
 * does not break when a brand moves it or blocks apps from loading it. product_media.url then points at the copy and
 * source_url keeps the original. Runs in the daily job (which also picks up products the AI service adds) and on
 * demand from POST /admin/products/copy-images. A link that fails is marked and not retried by the daily job.
 */
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export type CopyResult = { copied: number; failed: number; left: number; skipped?: string };
type MediaRow = { id: string; product_id: string; url: string; position: number };

export class CopyImagesQueryDto {
  @ApiProperty({ required: false, default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiProperty({ required: false, description: '1 = also retry photos that failed before.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  retry_failed?: number;
}

export class CopyResultDto {
  @ApiProperty() copied!: number;
  @ApiProperty() failed!: number;
  @ApiProperty({ description: 'Photos still on outside links after this run.' }) left!: number;
  @ApiProperty({ required: false }) skipped?: string;
}

/** Made by a factory in CatalogModule (the storage may be missing, and tests pass their own fetch). */
export class ProductImagesService {
  private readonly logger = new Logger('ProductImages');

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ProductImageStorage | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async copy(limit = 100, retryFailed = false): Promise<CopyResult> {
    if (!this.storage) {
      return { copied: 0, failed: 0, left: 0, skipped: 'Photo storage is not set up.' };
    }
    const prefix = this.storage.publicUrl('');
    const rows = await this.database.query<MediaRow>(
      `select id, product_id, url, position from public.product_media
       where url not like $1 || '%' and ($2 or copy_failed_at is null)
       order by product_id, position limit $3`,
      [prefix, retryFailed, limit],
    );
    let copied = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const { body, type } = await this.download(row.url);
        const key = `products/${row.product_id}/${row.position}-${row.id.slice(0, 8)}.${TYPES[type]}`;
        await this.storage.upload(key, body, type);
        await this.database.query(
          `update public.product_media set source_url = coalesce(source_url, url), url = $2, copied_at = now(), copy_failed_at = null where id = $1`,
          [row.id, this.storage.publicUrl(key)],
        );
        copied += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`photo ${row.id} not copied: ${error instanceof Error ? error.message : String(error)}`);
        await this.database.query('update public.product_media set copy_failed_at = now() where id = $1', [row.id]);
      }
    }
    const left = await this.database.query<{ n: number }>(`select count(*)::int as n from public.product_media where url not like $1 || '%'`, [prefix]);
    return { copied, failed, left: left[0]?.n ?? 0 };
  }

  /** Downloads one photo: https only, an image type the bucket takes, at most 5 MB. */
  private async download(url: string): Promise<{ body: ArrayBuffer; type: string }> {
    if (!/^https:\/\//i.test(url)) {
      throw new Error('not an https link');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal, headers: { Accept: 'image/webp,image/png,image/jpeg' }, redirect: 'follow' });
      if (!response.ok) {
        throw new Error(`answered ${response.status}`);
      }
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!TYPES[type]) {
        throw new Error(`not a supported image (${type || 'no type'})`);
      }
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_BYTES) {
        throw new Error('larger than 5 MB');
      }
      const body = await response.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > MAX_BYTES) {
        throw new Error(body.byteLength ? 'larger than 5 MB' : 'empty');
      }
      return { body, type };
    } finally {
      clearTimeout(timer);
    }
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/products')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Post('copy-images')
  @HttpCode(200)
  @ApiOperation({ summary: 'Copy product photos into Clara storage', description: 'Copies photos still loaded from brand or store websites. The daily job does this too.' })
  @ApiOkResponse({ type: CopyResultDto })
  copy(@Query() query: CopyImagesQueryDto): Promise<CopyResult> {
    return this.images.copy(query.limit ?? 100, query.retry_failed === 1);
  }
}
