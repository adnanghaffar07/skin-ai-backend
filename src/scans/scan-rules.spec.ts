import { describe, expect, it } from 'vitest';
import {
  assertCanCreateScan,
  cleanQuality,
  isUnder18,
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
  it('allows a later scan when onboarding said "not now"', () => {
    expect(
      codeOf(() =>
        assertCanCreateScan({ ...ok, faceScanOptIn: 'continue_without_scan' }),
      ),
    ).toBeUndefined();
  });
});

describe('cleanQuality', () => {
  it('keeps the known photo checks and drops anything else', () => {
    expect(
      cleanQuality({ sharpness: 48.23456, cut_off: false, other_faces: 0, note: 'x', yaw: 'high', face_pixels: Infinity }),
    ).toEqual({ sharpness: 48.235, cut_off: false, other_faces: 0 });
  });
  it('is null when nothing usable was sent', () => {
    expect(cleanQuality(undefined)).toBeNull();
    expect(cleanQuality({ junk: 1 })).toBeNull();
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

describe('isUnder18', () => {
  const today = new Date('2026-11-16T12:00:00Z');
  it('is true until the 18th birthday', () => {
    expect(isUnder18('2008-11-17', today)).toBe(true);
    expect(isUnder18('2015-01-01', today)).toBe(true);
  });
  it('is false on and after the 18th birthday', () => {
    expect(isUnder18('2008-11-16', today)).toBe(false);
    expect(isUnder18('1995-05-05', today)).toBe(false);
  });
  it('is false when there is no usable date', () => {
    expect(isUnder18(null, today)).toBe(false);
    expect(isUnder18('not-a-date', today)).toBe(false);
  });
  it('blocks the create gate through the profile date of birth', () => {
    expect(
      codeOf(() => assertCanCreateScan({ ...ok, birthDate: '2015-01-01', today })),
    ).toBe('AGE_RESTRICTED');
  });
});
