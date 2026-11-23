import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { MediaStorage } from '../storage/object-storage.js';
import { AvatarService } from './avatar.service.js';
import type { UsersService } from './users.service.js';

const user = { id: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77', email: 'a@example.com', displayName: null };
const own = `users/${user.id}/avatar-1795461200000.jpg`;

function setup(over: { head?: { contentType: string; byteSize: number } | null; previous?: string | null; key?: string | null } = {}) {
  const storage = {
    createSignedUpload: vi.fn().mockResolvedValue({ upload_url: 'https://up', method: 'PUT', headers: {}, expires_at: 'x' }),
    head: vi.fn().mockResolvedValue(over.head === undefined ? { contentType: 'image/jpeg', byteSize: 1000 } : over.head),
    delete: vi.fn().mockResolvedValue(undefined),
    createSignedDownload: vi.fn().mockResolvedValue('https://signed/view'),
  };
  const database = {
    query: vi.fn(async (sql: string) => (sql.startsWith('with old') ? [{ previous: over.previous ?? null }] : [{ key: over.key ?? null }])),
  };
  const users = { getMe: vi.fn().mockResolvedValue({}) };
  const service = new AvatarService(users as unknown as UsersService, database as unknown as DatabaseService, storage as unknown as MediaStorage);
  return { service, storage, database };
}

describe('AvatarService', () => {
  it('hands out an upload link in the person\'s own folder, for small images only', async () => {
    const { service, storage } = setup();
    const link = await service.uploadUrl(user, 'image/jpeg', 2000);
    expect(link.object_key).toMatch(new RegExp(`^users/${user.id}/avatar-\\d+\\.jpg$`));
    expect(storage.createSignedUpload).toHaveBeenCalled();
    await expect(service.uploadUrl(user, 'image/gif', 2000)).rejects.toMatchObject({ status: 400 });
    await expect(service.uploadUrl(user, 'image/png', 6 * 1024 * 1024)).rejects.toMatchObject({ status: 400 });
  });

  it('confirms an uploaded photo, deletes the old one and returns a signed link', async () => {
    const { service, storage } = setup({ previous: `users/${user.id}/avatar-1.jpg` });
    expect(await service.confirm(user, own)).toEqual({ avatar_url: 'https://signed/view' });
    expect(storage.delete).toHaveBeenCalledWith(`users/${user.id}/avatar-1.jpg`);
  });

  it('refuses someone else\'s upload, a missing file and a file that is not a small image', async () => {
    await expect(setup().service.confirm(user, 'users/00000000-0000-0000-0000-000000000000/avatar-1.jpg')).rejects.toMatchObject({ status: 400 });
    await expect(setup({ head: null }).service.confirm(user, own)).rejects.toMatchObject({ status: 409 });
    const big = setup({ head: { contentType: 'image/jpeg', byteSize: 9e6 } });
    await expect(big.service.confirm(user, own)).rejects.toMatchObject({ status: 400 });
    expect(big.storage.delete).toHaveBeenCalledWith(own);
  });

  it('gives no link without a photo, and does not fail /me when storage does', async () => {
    expect(await setup().service.url(user.id)).toBeNull();
    const broken = setup({ key: own });
    broken.storage.createSignedDownload.mockRejectedValueOnce(new Error('down'));
    expect(await broken.service.url(user.id)).toBeNull();
  });
});
