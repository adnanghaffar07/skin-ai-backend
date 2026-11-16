import { describe, expect, it } from 'vitest';
import { PlausibleBirthDate } from './update-profile.dto.js';

const rule = new PlausibleBirthDate();

describe('PlausibleBirthDate', () => {
  it('accepts a real past date', () => {
    expect(rule.validate('1995-05-05')).toBe(true);
    expect(rule.validate('1900-01-01')).toBe(true);
  });
  it('rejects the future, days that do not exist and dates before 1900', () => {
    expect(rule.validate('2090-01-01')).toBe(false);
    expect(rule.validate('2026-02-30')).toBe(false);
    expect(rule.validate('1899-12-31')).toBe(false);
  });
  it('rejects values that are not text', () => {
    expect(rule.validate(20150101)).toBe(false);
    expect(rule.validate(undefined)).toBe(false);
  });
});
