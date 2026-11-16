import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { UsersService } from '../users/users.service.js';
import type {
  CreateScanDto,
  ScanDto,
  ScanListDto,
  ScanResultDto,
  SubmitScanResponseDto,
  UploadUrlDto,
  UploadUrlResponseDto,
} from './dto/scan.dto.js';
import {
  assertCanCreateScan,
  assertImageMatches,
  assertUploadAllowed,
  scanObjectKey,
  UPLOAD_URL_TTL_SECONDS,
} from './scan-rules.js';
import { ScansRepository, type ScanRow } from './scans.repository.js';

export const SCAN_DISCLAIMER =
  'AI results are estimates, not medical diagnoses, and should not replace professional dermatological advice.';

function toScan(row: ScanRow): ScanDto {
  return {
    id: row.id,
    status: row.status,
    submitted_at: row.submitted_at
      ? new Date(row.submitted_at).toISOString()
      : null,
    created_at: new Date(row.created_at).toISOString(),
    has_image: row.has_image,
    analysis_available: false,
  };
}

@Injectable()
export class ScansService {
  constructor(
    private readonly users: UsersService,
    private readonly scans: ScansRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async create(
    user: AuthenticatedUser,
    idempotencyKey: string | undefined,
    body: CreateScanDto,
  ): Promise<ScanDto> {
    if (!idempotencyKey || idempotencyKey.length > 64) {
      throw new ApiException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Idempotency-Key header is required (max 64 characters).',
      );
    }
    await this.users.getMe(user);
    const existing = await this.scans.findByIdempotencyKey(
      user.id,
      idempotencyKey,
    );
    if (existing) {
      return toScan(existing);
    }
    const eligibility = await this.scans.eligibility(
      user.id,
      body.submission_id,
    );
    if (!eligibility.submission_found) {
      throw new ApiException(
        404,
        ErrorCode.NOT_FOUND,
        'Questionnaire submission not found.',
      );
    }
    assertCanCreateScan({
      hasLiveConsent: eligibility.consent_id !== null,
      ageRange: eligibility.age_range,
      birthDate: eligibility.birth_date,
      submissionCompleted: eligibility.submission_completed,
      faceScanOptIn: eligibility.face_scan_opt_in,
    });
    const created = await this.scans.create(
      user.id,
      body.submission_id,
      eligibility.consent_id as string,
      idempotencyKey,
    );
    if (created) {
      return toScan(created);
    }
    const raced = await this.scans.findByIdempotencyKey(user.id, idempotencyKey);
    if (!raced) {
      throw new ApiException(
        409,
        ErrorCode.CONFLICT,
        'Scan could not be created. Retry.',
      );
    }
    return toScan(raced);
  }

  async uploadUrl(
    user: AuthenticatedUser,
    scanId: string,
    body: UploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    const scan = await this.requireScan(user.id, scanId);
    this.assertAwaitingUpload(scan);
    await this.assertConsentStillLive(user.id);
    assertUploadAllowed(body.content_type, body.byte_size);
    const previous = await this.scans.getImage(scan.id);
    const objectKey = scanObjectKey(
      user.id,
      scan.id,
      body.content_type,
      randomUUID(),
    );
    const signed = await this.storage.createSignedUpload({
      key: objectKey,
      contentType: body.content_type,
      byteSize: body.byte_size,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    await this.scans.saveImage(scan.id, {
      provider: this.storage.provider,
      bucket: this.storage.bucket,
      objectKey,
      contentType: body.content_type,
      byteSize: body.byte_size,
    });
    if (previous && previous.object_key !== objectKey) {
      await this.storage.delete(previous.object_key);
    }
    return { ...signed, object_key: objectKey };
  }

  async submit(
    user: AuthenticatedUser,
    scanId: string,
  ): Promise<SubmitScanResponseDto> {
    const scan = await this.requireScan(user.id, scanId);
    this.assertAwaitingUpload(scan);
    await this.assertConsentStillLive(user.id);
    const image = await this.scans.getImage(scan.id);
    if (!image) {
      throw new ApiException(
        422,
        ErrorCode.VALIDATION_ERROR,
        'Request an upload URL and upload the photo first.',
      );
    }
    const head = await this.storage.head(image.object_key);
    assertImageMatches(head, {
      contentType: image.content_type,
      byteSize: image.byte_size,
    });
    const done = await this.scans.markSubmitted(scan.id, head!.byteSize);
    if (!done) {
      throw new ApiException(
        409,
        ErrorCode.CONFLICT,
        'Scan was already submitted or cancelled.',
      );
    }
    return {
      id: scan.id,
      status: 'ready_for_analysis',
      submitted_at: new Date(done.submitted_at).toISOString(),
      analysis_available: false,
    };
  }

  async get(user: AuthenticatedUser, scanId: string): Promise<ScanDto> {
    return toScan(await this.requireScan(user.id, scanId));
  }

  async list(user: AuthenticatedUser): Promise<ScanListDto> {
    await this.users.getMe(user);
    return { items: (await this.scans.list(user.id)).map(toScan) };
  }

  async result(user: AuthenticatedUser, scanId: string): Promise<ScanResultDto> {
    const scan = await this.requireScan(user.id, scanId);
    return {
      scan_id: scan.id,
      status: scan.status,
      basis: 'not_ready',
      analysis_available: false,
      submitted_at: scan.submitted_at
        ? new Date(scan.submitted_at).toISOString()
        : null,
      assessment: null,
      recommendations: null,
      routine: null,
      sources: [],
      disclaimer: SCAN_DISCLAIMER,
      generated_at: null,
    };
  }

  /** Retake: drop the photo before submit. */
  async deleteImage(user: AuthenticatedUser, scanId: string): Promise<void> {
    const scan = await this.requireScan(user.id, scanId);
    this.assertAwaitingUpload(scan);
    const image = await this.scans.getImage(scan.id);
    if (image) {
      await this.storage.delete(image.object_key);
      await this.scans.deleteImage(scan.id);
    }
  }

  async cancel(user: AuthenticatedUser, scanId: string): Promise<void> {
    const scan = await this.requireScan(user.id, scanId);
    const image = await this.scans.getImage(scan.id);
    if (image) {
      await this.storage.delete(image.object_key);
    }
    await this.scans.cancel(scan.id);
  }

  private async requireScan(userId: string, scanId: string): Promise<ScanRow> {
    const scan = await this.scans.get(userId, scanId);
    if (!scan) {
      throw new ApiException(404, ErrorCode.NOT_FOUND, 'Scan not found.');
    }
    return scan;
  }

  /** A person can withdraw consent after the scan was created; nothing is uploaded or submitted after that. */
  private async assertConsentStillLive(userId: string): Promise<void> {
    if (!(await this.scans.hasLiveConsent(userId))) {
      throw new ApiException(
        422,
        ErrorCode.CONSENT_REQUIRED,
        'Facial image processing consent is required before a scan.',
      );
    }
  }

  private assertAwaitingUpload(scan: ScanRow): void {
    if (scan.status !== 'awaiting_upload') {
      throw new ApiException(
        409,
        ErrorCode.CONFLICT,
        `Scan is ${scan.status} and can no longer change its photo.`,
      );
    }
  }
}
