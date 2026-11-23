import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { MediaStorage, ObjectStorage } from '../storage/object-storage.js';
import { AccountRepository } from './account.repository.js';

export const EXPORT_FORMAT_VERSION = 1;

@Injectable()
export class AccountService {
  constructor(
    private readonly account: AccountRepository,
    private readonly storage: ObjectStorage,
    private readonly media: MediaStorage,
  ) {}

  async exportData(
    user: AuthenticatedUser,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    return {
      format: 'clara-data-export',
      version: EXPORT_FORMAT_VERSION,
      exported_at: now.toISOString(),
      ...(await this.account.exportData(user.id)),
    };
  }

  /**
   * Photos go first: if storage cannot remove one, the account is left as it was rather than
   * leaving a face photo behind with nothing pointing at it.
   */
  async deleteAccount(user: AuthenticatedUser): Promise<void> {
    for (const key of await this.account.photoKeys(user.id)) {
      await this.storage.delete(key);
    }
    // Pictures the person added (the profile photo) are in the user-media bucket.
    for (const key of await this.account.mediaKeys(user.id)) {
      await this.media.delete(key);
    }
    await this.account.deleteAccount(user.id);
  }
}
