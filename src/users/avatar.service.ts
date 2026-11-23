import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import { MediaStorage } from '../storage/object-storage.js';
import { UsersService } from './users.service.js';

export const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** How long a profile photo link works. The app reads /me again on each start, so a fresh link comes with it. */
export const AVATAR_LINK_SECONDS = 60 * 60;

const ownsKey = (userId: string, key: string) => key.startsWith(`users/${userId}/avatar-`) && !key.includes('..');

/**
 * The profile photo, kept in the private user-media bucket. The phone uploads through a one-time signed link, then
 * confirms; the API checks the file is there and is a small image before it becomes the photo. Viewing is through a
 * signed link that expires, never a public address.
 */
@Injectable()
export class AvatarService {
  constructor(
    private readonly users: UsersService,
    private readonly database: DatabaseService,
    private readonly storage: MediaStorage,
  ) {}

  async uploadUrl(user: AuthenticatedUser, contentType: string, byteSize: number) {
    const ext = AVATAR_TYPES[contentType];
    if (!ext) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Use a JPEG, PNG or WebP picture.');
    }
    if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > AVATAR_MAX_BYTES) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'The picture must be 5 MB or smaller.');
    }
    await this.users.getMe(user);
    const objectKey = `users/${user.id}/avatar-${Date.now()}.${ext}`;
    const link = await this.storage.createSignedUpload({ key: objectKey, contentType, byteSize, expiresInSeconds: 600 });
    return { ...link, object_key: objectKey };
  }

  /** Makes an uploaded picture the profile photo and deletes the one before it. Returns the new viewing link. */
  async confirm(user: AuthenticatedUser, objectKey: string): Promise<{ avatar_url: string }> {
    if (!ownsKey(user.id, objectKey)) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'That upload does not belong to this account.');
    }
    const head = await this.storage.head(objectKey);
    if (!head) {
      throw new ApiException(409, ErrorCode.CONFLICT, 'The picture has not been uploaded yet.');
    }
    if (!AVATAR_TYPES[head.contentType] || head.byteSize > AVATAR_MAX_BYTES) {
      await this.storage.delete(objectKey).catch(() => undefined);
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Use a JPEG, PNG or WebP picture of 5 MB or smaller.');
    }
    await this.users.getMe(user);
    const previous = await this.setKey(user.id, objectKey);
    if (previous && previous !== objectKey) {
      await this.storage.delete(previous).catch(() => undefined);
    }
    return { avatar_url: await this.storage.createSignedDownload(objectKey, AVATAR_LINK_SECONDS) };
  }

  async remove(user: AuthenticatedUser): Promise<void> {
    await this.users.getMe(user);
    const previous = await this.setKey(user.id, null);
    if (previous) {
      await this.storage.delete(previous);
    }
  }

  /** The viewing link for the person's photo, or null. A storage hiccup must not break /me, so it gives null then. */
  async url(userId: string): Promise<string | null> {
    const rows = await this.database.query<{ key: string | null }>(
      'select avatar_object_key as key from public.user_profiles where user_id = $1',
      [userId],
    );
    const key = rows[0]?.key;
    if (!key) {
      return null;
    }
    return this.storage.createSignedDownload(key, AVATAR_LINK_SECONDS).catch(() => null);
  }

  /** The photo's place in storage, for account deletion. */
  async key(userId: string): Promise<string | null> {
    const rows = await this.database.query<{ key: string | null }>(
      'select avatar_object_key as key from public.user_profiles where user_id = $1',
      [userId],
    );
    return rows[0]?.key ?? null;
  }

  /** Sets the photo and returns the one it replaced. */
  private async setKey(userId: string, key: string | null): Promise<string | null> {
    const rows = await this.database.query<{ previous: string | null }>(
      `with old as (select avatar_object_key from public.user_profiles where user_id = $1)
       update public.user_profiles set avatar_object_key = $2, updated_at = now() where user_id = $1
       returning (select avatar_object_key from old) as previous`,
      [userId, key],
    );
    return rows[0]?.previous ?? null;
  }
}
