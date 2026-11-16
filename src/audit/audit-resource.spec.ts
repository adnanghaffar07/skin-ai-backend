import { describe, expect, it } from 'vitest';
import { auditTarget } from './audit-resource.js';

describe('auditTarget', () => {
  const id = '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77';
  it('keeps the resource and the id, never the query string', () => {
    expect(auditTarget(`/api/v1/scans/${id}/submit?token=secret`)).toEqual({
      resource: 'scans',
      resourceId: id,
    });
  });
  it('has no id for list routes', () => {
    expect(auditTarget('/api/v1/products?q=cream')).toEqual({
      resource: 'products',
      resourceId: null,
    });
  });
  it('skips health', () => {
    expect(auditTarget('/api/v1/health')).toBeNull();
  });
});
