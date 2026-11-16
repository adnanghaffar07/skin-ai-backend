import { describe, expect, it } from 'vitest';
import {
  assertCanCreateScan,
  assertImageMatches,
  assertUploadAllowed,
  MAX_IMAGE_BYTES,
  scanObjectKey,
} from './scan-rules.js';

const ok = {
  hasLiveConsent: true,
  ageRange: 'age_25_34',
  submissionCompleted: true,
  faceScanOptIn: 'start_scan',
};

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
  return undefined;
}

describe('assertCanCreateScan', () => {
  it('allows a consenting adult who chose start_scan', () => {
    expect(codeOf(() => assertCanCreateScan(ok))).toBeUndefined();
  });
  it('blocks under_18 before anything else', () => {
    expect(
      codeOf(() =>
        assertCanCreateScan({ ...ok, ageRange: 'under_18', hasLiveConsent: false }),
      ),
    ).toBe('AGE_RESTRICTED');
  });
  it('requires live consent', () => {
    expect(codeOf(() => assertCanCreateScan({ ...ok, hasLiveConsent: false }))).toBe(
      'CONSENT_REQUIRED',
    );
  });
  it('requires a completed submission', () => {
    expect(
      codeOf(() => assertCanCreateScan({ ...ok, submissionCompleted: false })),
    ).toBe('VALIDATION_ERROR');
  });
  it('requires start_scan', () => {
    expect(
      codeOf(() =>
        assertCanCreateScan({ ...ok, faceScanOptIn: 'continue_without_scan' }),
      ),
    ).toBe('VALIDATION_ERROR');
  });
});

describe('assertUploadAllowed', () => {
  it('accepts jpeg at the size limit', () => {
    expect(codeOf(() => assertUploadAllowed('image/jpeg', MAX_IMAGE_BYTES))).toBeUndefined();
  });
  it('rejects other types', () => {
    expect(codeOf(() => assertUploadAllowed('image/gif', 10))).toBe(
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });
  it('rejects oversize files', () => {
    expect(codeOf(() => assertUploadAllowed('image/png', MAX_IMAGE_BYTES + 1))).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });
});

describe('assertImageMatches', () => {
  const declared = { contentType: 'image/jpeg', byteSize: 100 };
  it('rejects a missing object', () => {
    expect(codeOf(() => assertImageMatches(null, declared))).toBe('VALIDATION_ERROR');
  });
  it('rejects a different content type', () => {
    expect(
      codeOf(() =>
        assertImageMatches({ contentType: 'image/png', byteSize: 100 }, declared),
      ),
    ).toBe('VALIDATION_ERROR');
  });
  it('accepts a matching object', () => {
    expect(
      codeOf(() =>
        assertImageMatches({ contentType: 'image/jpeg', byteSize: 90 }, declared),
      ),
    ).toBeUndefined();
  });
});

describe('scanObjectKey', () => {
  it('keeps the object under the owner prefix', () => {
    expect(scanObjectKey('u1', 's1', 'image/webp', 'n')).toBe('scans/u1/s1/n.webp');
  });
});
