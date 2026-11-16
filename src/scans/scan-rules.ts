import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';

export const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const MAX_IMAGE_BYTES = 8388608;
export const UPLOAD_URL_TTL_SECONDS = 600;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function scanObjectKey(
  userId: string,
  scanId: string,
  contentType: string,
  nonce: string,
): string {
  return `scans/${userId}/${scanId}/${nonce}.${EXTENSIONS[contentType] ?? 'bin'}`;
}

export function scanKeyPrefix(userId: string, scanId: string): string {
  return `scans/${userId}/${scanId}/`;
}

export function assertUploadAllowed(contentType: string, byteSize: number): void {
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new ApiException(
      415,
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      'Photo must be JPEG, PNG or WebP.',
    );
  }
  if (byteSize > MAX_IMAGE_BYTES) {
    throw new ApiException(
      413,
      ErrorCode.PAYLOAD_TOO_LARGE,
      `Photo must be ${MAX_IMAGE_BYTES} bytes or smaller.`,
    );
  }
}

/** True when the date of birth (yyyy-mm-dd) says the person has not turned 18 yet. A missing or unreadable date is not under 18. */
export function isUnder18(birthDate: string | null | undefined, today: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? '');
  if (!match) {
    return false;
  }
  const birth = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const turns18 = Date.UTC(Number(match[1]) + 18, Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(birth) && turns18 > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

export interface ScanEligibilityInput {
  hasLiveConsent: boolean;
  ageRange: string | null;
  /** Date of birth from the profile (yyyy-mm-dd), when the person entered one. */
  birthDate?: string | null;
  today?: Date;
  submissionCompleted: boolean;
  faceScanOptIn: string | null;
}

/** Create-scan gate: age first, then consent, then the onboarding choice. */
export function assertCanCreateScan(input: ScanEligibilityInput): void {
  if (input.ageRange === 'under_18' || isUnder18(input.birthDate, input.today)) {
    throw new ApiException(
      403,
      ErrorCode.AGE_RESTRICTED,
      'Face scans are not available for users under 18.',
    );
  }
  if (!input.hasLiveConsent) {
    throw new ApiException(
      422,
      ErrorCode.CONSENT_REQUIRED,
      'Facial image processing consent is required before a scan.',
    );
  }
  if (!input.submissionCompleted) {
    throw new ApiException(
      422,
      ErrorCode.VALIDATION_ERROR,
      'Onboarding must be completed before a scan.',
    );
  }
  if (input.faceScanOptIn !== 'start_scan') {
    throw new ApiException(
      422,
      ErrorCode.VALIDATION_ERROR,
      'Face scan was not chosen in onboarding.',
    );
  }
}

export function assertImageMatches(
  head: { contentType: string; byteSize: number } | null,
  declared: { contentType: string; byteSize: number },
): void {
  if (!head) {
    throw new ApiException(
      422,
      ErrorCode.VALIDATION_ERROR,
      'No uploaded photo was found. Upload the photo first.',
    );
  }
  assertUploadAllowed(head.contentType, head.byteSize);
  if (head.contentType !== declared.contentType || head.byteSize <= 0) {
    throw new ApiException(
      422,
      ErrorCode.VALIDATION_ERROR,
      'Uploaded photo does not match the requested type.',
    );
  }
}
