import { describe, expect, it, vi } from 'vitest';
import { SupabaseStorage } from './supabase-storage.js';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe('SupabaseStorage', () => {
  it('asks Supabase for a signed upload link with the secret key, and returns a full PUT URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ url: '/object/upload/sign/scan-photos/scans/u/s/n.jpg?token=t' }));
    const storage = new SupabaseStorage('https://p.supabase.co/', 'sb_secret_x', fetchImpl);
    const signed = await storage.createSignedUpload({ key: 'scans/u/s/n.jpg', contentType: 'image/jpeg', byteSize: 10, expiresInSeconds: 600 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://p.supabase.co/storage/v1/object/upload/sign/scan-photos/scans/u/s/n.jpg',
      expect.objectContaining({ method: 'POST', headers: { apikey: 'sb_secret_x' } }),
    );
    expect(signed).toMatchObject({
      upload_url: 'https://p.supabase.co/storage/v1/object/upload/sign/scan-photos/scans/u/s/n.jpg?token=t',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    });
  });

  it('sends an older service_role key as a bearer token too', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([]));
    await new SupabaseStorage('https://p.supabase.co', 'eyJabc', fetchImpl).head('scans/u/s/n.jpg');
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ apikey: 'eyJabc', Authorization: 'Bearer eyJabc' });
  });

  it('reads size and type of an uploaded photo, or null when it is missing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok([{ name: 'n.jpg', metadata: { size: 1234, mimetype: 'image/jpeg' } }]))
      .mockResolvedValueOnce(ok([]));
    const storage = new SupabaseStorage('https://p.supabase.co', 'sb_secret_x', fetchImpl);
    expect(await storage.head('scans/u/s/n.jpg')).toEqual({ contentType: 'image/jpeg', byteSize: 1234 });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ prefix: 'scans/u/s', search: 'n.jpg' });
    expect(await storage.head('scans/u/s/n.jpg')).toBeNull();
  });

  it('deletes by key, and answers 503 when storage fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const storage = new SupabaseStorage('https://p.supabase.co', 'sb_secret_x', fetchImpl);
    await storage.delete('scans/u/s/n.jpg');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://p.supabase.co/storage/v1/object/scan-photos');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ prefixes: ['scans/u/s/n.jpg'] });
    await expect(storage.delete('scans/u/s/n.jpg')).rejects.toMatchObject({ status: 503 });
  });
});
