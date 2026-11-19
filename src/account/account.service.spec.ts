import { ApiException } from '../common/http/api.exception.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import type { ObjectStorage } from '../storage/object-storage.js';
import type { AccountRepository } from './account.repository.js';
import { AccountService } from './account.service.js';

const user = { id: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77', email: 'a@example.com', displayName: null };

function setup(keys: string[], deleteFails = false) {
  const calls: string[] = [];
  const repository = {
    exportData: async () => ({ profile: { display_name: 'Ayesha' } }),
    photoKeys: async () => keys,
    deleteAccount: async () => {
      calls.push('account');
    },
  } as unknown as AccountRepository;
  const storage = {
    delete: async (key: string) => {
      if (deleteFails) {
        throw new ApiException(503, ErrorCode.INTERNAL_ERROR, 'Photo storage is not configured.');
      }
      calls.push(`photo:${key}`);
    },
  } as unknown as ObjectStorage;
  return { service: new AccountService(repository, storage), calls };
}

describe('AccountService', () => {
  it('removes every photo before deleting the account', async () => {
    const { service, calls } = setup(['scans/u/1/a.jpg', 'scans/u/2/b.jpg']);
    await service.deleteAccount(user);
    expect(calls).toEqual(['photo:scans/u/1/a.jpg', 'photo:scans/u/2/b.jpg', 'account']);
  });

  it('keeps the account when a photo cannot be removed', async () => {
    const { service, calls } = setup(['scans/u/1/a.jpg'], true);
    await expect(service.deleteAccount(user)).rejects.toThrow(/storage/);
    expect(calls).toEqual([]);
  });

  it('labels the export with its format, version and time', async () => {
    const { service } = setup([]);
    const result = await service.exportData(user, new Date('2026-11-20T10:00:00.000Z'));
    expect(result).toEqual({
      format: 'clara-data-export',
      version: 1,
      exported_at: '2026-11-20T10:00:00.000Z',
      profile: { display_name: 'Ayesha' },
    });
  });
});
