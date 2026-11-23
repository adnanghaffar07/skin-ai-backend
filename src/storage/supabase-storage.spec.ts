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

  it('signs a viewing link in the bucket it was made for (user-media)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ signedURL: '/object/sign/user-media/users/u/avatar-1.jpg?token=t' }));
    const storage = new SupabaseStorage('https://p.supabase.co', 'sb_secret_x', fetchImpl, 'user-media');
    expect(await storage.createSignedDownload('users/u/avatar-1.jpg', 3600)).toBe(
      'https://p.supabase.co/storage/v1/object/sign/user-media/users/u/avatar-1.jpg?token=t',
    );
    expect(fetchImpl.mock.calls[0][0]).toBe('https://p.supabase.co/storage/v1/object/sign/user-media/users/u/avatar-1.jpg');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ expiresIn: 3600 });
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

  it('reads the key from a lookup (Vault) once and keeps it', async () => {
    const lookup = vi.fn().mockResolvedValue('sb_secret_vault');
    const fetchImpl = vi.fn().mockResolvedValue(ok([]));
    const storage = new SupabaseStorage('https://p.supabase.co', lookup, fetchImpl);
    await storage.head('scans/u/s/a.jpg');
    await storage.head('scans/u/s/b.jpg');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ apikey: 'sb_secret_vault' });
  });

  it('answers 503 without calling storage when the lookup finds no key, and does not ask again straight away', async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    const fetchImpl = vi.fn();
    const storage = new SupabaseStorage('https://p.supabase.co', lookup, fetchImpl);
    await expect(storage.head('scans/u/s/a.jpg')).rejects.toMatchObject({ status: 503 });
    await expect(storage.head('scans/u/s/a.jpg')).rejects.toMatchObject({ status: 503 });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ignores a value that is not a Supabase secret key, and a lookup that fails', async () => {
    const storage = new SupabaseStorage('https://p.supabase.co', vi.fn().mockResolvedValue('not-a-key'), vi.fn());
    await expect(storage.head('scans/u/s/a.jpg')).rejects.toMatchObject({ status: 503 });
    const failing = new SupabaseStorage('https://p.supabase.co', vi.fn().mockRejectedValue(new Error('db down')), vi.fn());
    await expect(failing.head('scans/u/s/a.jpg')).rejects.toMatchObject({ status: 503 });
  });

  it('looks the key up again after storage refuses it', async () => {
    const lookup = vi.fn().mockResolvedValueOnce('sb_secret_old').mockResolvedValueOnce('sb_secret_new');
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 403 } as Response).mockResolvedValueOnce(ok([]));
    const storage = new SupabaseStorage('https://p.supabase.co', lookup, fetchImpl);
    await expect(storage.head('scans/u/s/a.jpg')).rejects.toMatchObject({ status: 503 });
    await storage.head('scans/u/s/a.jpg');
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ apikey: 'sb_secret_new' });
  });
});
