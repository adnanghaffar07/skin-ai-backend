import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage } from '../storage/object-storage.js';
import type { UsersService } from '../users/users.service.js';
import type { ScanRow, ScansRepository } from './scans.repository.js';
import { ScansService } from './scans.service.js';

const user = { id: 'u1', email: null, displayName: null };

function scanRow(status = 'awaiting_upload'): ScanRow {
  return {
    id: 's1',
    status,
    submitted_at: null,
    created_at: new Date('2026-11-11T10:00:00Z'),
    has_image: false,
  };
}

function build(overrides: {
  repo?: Partial<Record<keyof ScansRepository, unknown>>;
  storage?: Partial<Record<keyof ObjectStorage, unknown>>;
}) {
  const repo = {
    get: vi.fn().mockResolvedValue(scanRow()),
    getImage: vi.fn().mockResolvedValue(null),
    hasLiveConsent: vi.fn().mockResolvedValue(true),
    saveImage: vi.fn().mockResolvedValue(undefined),
    ...overrides.repo,
  };
  const storage = {
    provider: 'fake',
    bucket: 'b',
    createSignedUpload: vi.fn().mockResolvedValue({
      upload_url: 'https://upload.test/x',
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      expires_at: '2026-11-11T10:10:00.000Z',
    }),
    head: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides.storage,
  };
  const users = { getMe: vi.fn().mockResolvedValue({}) };
  const service = new ScansService(
    users as unknown as UsersService,
    repo as unknown as ScansRepository,
    storage as unknown as ObjectStorage,
  );
  return { service, repo, storage };
}

describe('ScansService', () => {
  it('requires an Idempotency-Key on create', async () => {
    const { service } = build({});
    await expect(
      service.create(user, undefined, { submission_id: 'x' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns the original scan for a repeated Idempotency-Key', async () => {
    const { service, repo } = build({
      repo: { findByIdempotencyKey: vi.fn().mockResolvedValue(scanRow()) },
    });
    const scan = await service.create(user, 'k1', { submission_id: 'x' });
    expect(scan.id).toBe('s1');
    expect(repo.saveImage).not.toHaveBeenCalled();
  });

  it('answers 404 for a scan that is not the caller\'s', async () => {
    const { service } = build({ repo: { get: vi.fn().mockResolvedValue(null) } });
    await expect(service.get(user, 's9')).rejects.toMatchObject({ status: 404 });
  });

  it('issues an upload URL under the owner prefix and saves the image row', async () => {
    const { service, repo } = build({});
    const out = await service.uploadUrl(user, 's1', {
      content_type: 'image/jpeg',
      byte_size: 1000,
    });
    expect(out.object_key.startsWith('scans/u1/s1/')).toBe(true);
    expect(out.method).toBe('PUT');
    expect(repo.saveImage).toHaveBeenCalledOnce();
  });

  it('deletes the replaced photo when a new upload URL is requested', async () => {
    const { service, storage } = build({
      repo: {
        getImage: vi
          .fn()
          .mockResolvedValue({ object_key: 'old', content_type: 'image/jpeg', byte_size: 1 }),
      },
    });
    await service.uploadUrl(user, 's1', { content_type: 'image/png', byte_size: 10 });
    expect(storage.delete).toHaveBeenCalledWith('old');
  });

  it('refuses a new upload URL once submitted', async () => {
    const { service } = build({
      repo: { get: vi.fn().mockResolvedValue(scanRow('ready_for_analysis')) },
    });
    await expect(
      service.uploadUrl(user, 's1', { content_type: 'image/jpeg', byte_size: 10 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('submit fails when the object is missing from storage', async () => {
    const { service } = build({
      repo: {
        getImage: vi
          .fn()
          .mockResolvedValue({ object_key: 'k', content_type: 'image/jpeg', byte_size: 5 }),
      },
      storage: { head: vi.fn().mockResolvedValue(null) },
    });
    await expect(service.submit(user, 's1')).rejects.toMatchObject({ status: 422 });
  });

  it('submit sets ready_for_analysis without analysis', async () => {
    const markSubmitted = vi
      .fn()
      .mockResolvedValue({ submitted_at: new Date('2026-11-11T10:05:00Z') });
    const { service } = build({
      repo: {
        getImage: vi
          .fn()
          .mockResolvedValue({ object_key: 'k', content_type: 'image/jpeg', byte_size: 5 }),
        markSubmitted,
      },
      storage: { head: vi.fn().mockResolvedValue({ contentType: 'image/jpeg', byteSize: 5 }) },
    });
    const out = await service.submit(user, 's1');
    expect(out).toMatchObject({ status: 'ready_for_analysis', analysis_available: false });
    expect(markSubmitted).toHaveBeenCalledWith('s1', 5, null);
  });

  it('result is honest and empty', async () => {
    const { service } = build({});
    const out = await service.result(user, 's1');
    expect(out).toMatchObject({ basis: 'not_ready', assessment: null, analysis_available: false });
  });

  it('cancel deletes the stored photo', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const { service, storage } = build({
      repo: {
        getImage: vi
          .fn()
          .mockResolvedValue({ object_key: 'k', content_type: 'image/jpeg', byte_size: 5 }),
        cancel,
      },
    });
    await service.cancel(user, 's1');
    expect(storage.delete).toHaveBeenCalledWith('k');
    expect(cancel).toHaveBeenCalledWith('s1');
  });

  it('answers 404 when the submission does not belong to the user', async () => {
    const { service } = build({
      repo: {
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        eligibility: vi.fn().mockResolvedValue({
          age_range: 'age_25_34',
          birth_date: null,
          consent_id: 'c1',
          submission_found: false,
          submission_completed: false,
          face_scan_opt_in: null,
        }),
      },
    });
    await expect(
      service.create(user, 'key', { submission_id: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('blocks a user whose profile date of birth says under 18', async () => {
    const year = new Date().getUTCFullYear() - 10;
    const { service } = build({
      repo: {
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        eligibility: vi.fn().mockResolvedValue({
          age_range: 'age_25_34',
          birth_date: `${year}-01-01`,
          consent_id: 'c1',
          submission_found: true,
          submission_completed: true,
          face_scan_opt_in: 'start_scan',
        }),
      },
    });
    await expect(
      service.create(user, 'key', { submission_id: 'x' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses an upload URL after consent was withdrawn', async () => {
    const { service, storage } = build({
      repo: { hasLiveConsent: vi.fn().mockResolvedValue(false) },
    });
    await expect(
      service.uploadUrl(user, 's1', { content_type: 'image/jpeg', byte_size: 1000 }),
    ).rejects.toMatchObject({ status: 422 });
    expect(storage.createSignedUpload).not.toHaveBeenCalled();
  });

  it('does not store a photo without the training consent', async () => {
    const hasLiveConsent = vi.fn(async (_user: string, purpose = 'facial_image_processing') => purpose !== 'ai_model_training');
    const { service, storage } = build({ repo: { hasLiveConsent } });
    await expect(
      service.uploadUrl(user, 's1', { content_type: 'image/jpeg', byte_size: 1000 }),
    ).rejects.toMatchObject({ status: 422 });
    expect(hasLiveConsent).toHaveBeenCalledWith('u1', 'ai_model_training');
    expect(storage.createSignedUpload).not.toHaveBeenCalled();
  });

  it('refuses to submit after consent was withdrawn', async () => {
    const { service } = build({
      repo: { hasLiveConsent: vi.fn().mockResolvedValue(false) },
    });
    await expect(service.submit(user, 's1')).rejects.toMatchObject({ status: 422 });
  });
});
