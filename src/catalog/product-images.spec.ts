import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { ProductImageStorage } from '../storage/object-storage.js';
import { ProductImagesService } from './product-images.js';

const PUBLIC = 'https://x.supabase.co/storage/v1/object/public/product-images/';
const row = (id: string, url: string) => ({ id: `${id}0000000-0000`, product_id: 'p1', url, position: 0 });

function setup(rows: ReturnType<typeof row>[], respond: (url: string) => Response) {
  const database = {
    query: vi.fn(async (sql: string, _params?: unknown[]) => (sql.startsWith('select id') ? rows : sql.includes('count(*)') ? [{ n: 0 }] : [])),
  };
  const storage = { bucket: 'product-images', upload: vi.fn(async () => undefined), publicUrl: (key: string) => `${PUBLIC}${key}` };
  const fetchImpl = vi.fn(async (url: string) => respond(url));
  const service = new ProductImagesService(database as unknown as DatabaseService, storage as unknown as ProductImageStorage, fetchImpl as unknown as typeof fetch);
  return { service, database, storage };
}

const image = (type = 'image/jpeg', bytes = 10) => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': type } });

describe('product images', () => {
  it('copies a photo into storage and points the product at the copy', async () => {
    const { service, database, storage } = setup([row('a', 'https://brand.example/a.jpg')], () => image());
    expect(await service.copy()).toEqual({ copied: 1, failed: 0, left: 0 });
    expect(storage.upload).toHaveBeenCalledWith('products/p1/0-a0000000.jpg', expect.any(ArrayBuffer), 'image/jpeg');
    const update = database.query.mock.calls.find(([sql]) => sql.includes('set source_url'));
    expect(update?.[1]).toEqual(['a0000000-0000', `${PUBLIC}products/p1/0-a0000000.jpg`]);
  });

  it('marks a link that fails and carries on with the rest', async () => {
    const { service, database } = setup([row('a', 'https://gone.example/a.jpg'), row('b', 'https://brand.example/b.png')], url =>
      url.includes('gone') ? new Response('', { status: 404 }) : image('image/png'),
    );
    expect(await service.copy()).toMatchObject({ copied: 1, failed: 1 });
    expect(database.query).toHaveBeenCalledWith('update public.product_media set copy_failed_at = now() where id = $1', ['a0000000-0000']);
  });

  it('refuses links that are not https, pages that are not images, and files over 5 MB', async () => {
    const { service, storage } = setup(
      [row('a', 'http://brand.example/a.jpg'), row('b', 'https://brand.example/page'), row('c', 'https://brand.example/huge.jpg')],
      url => (url.includes('page') ? new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }) : image('image/jpeg', 6 * 1024 * 1024)),
    );
    expect(await service.copy()).toMatchObject({ copied: 0, failed: 3 });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('does nothing without photo storage', async () => {
    const database = { query: vi.fn() };
    const service = new ProductImagesService(database as unknown as DatabaseService, null);
    expect(await service.copy()).toMatchObject({ copied: 0, skipped: 'Photo storage is not set up.' });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('skips photos already in storage and, unless asked, ones that failed before', async () => {
    const { service, database } = setup([], () => image());
    await service.copy(50, false);
    expect(database.query.mock.calls[0][1]).toEqual([PUBLIC, false, 50]);
  });
});
