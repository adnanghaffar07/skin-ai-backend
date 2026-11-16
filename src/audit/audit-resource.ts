export interface AuditTarget {
  resource: string;
  resourceId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Maps /api/v1/scans/<uuid>/submit to { resource: 'scans', resourceId: '<uuid>' }. Query strings are dropped. */
export function auditTarget(url: string): AuditTarget | null {
  const path = url.split('?')[0];
  const parts = path.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0 || parts[0] === 'health') {
    return null;
  }
  const id = parts.find((part, index) => index > 0 && UUID.test(part));
  return { resource: parts[0].slice(0, 64), resourceId: id ?? null };
}
