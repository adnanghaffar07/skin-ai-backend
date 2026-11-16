import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface AuditEvent {
  userId: string;
  requestId: string | null;
  method: string;
  resource: string;
  resourceId: string | null;
  statusCode: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly database: DatabaseService) {}

  /** Never throws: a failed audit write must not break the request. */
  async record(event: AuditEvent): Promise<void> {
    try {
      // Uses the init-migration table. Raw resource id and status go in metadata, never bodies.
      await this.database.query(
        `insert into public.audit_events
           (actor_user_id, action, entity_type, entity_id, metadata)
         values ($1, $2, $3, case when $4 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then $4::uuid end, $5::jsonb)`,
        [
          event.userId,
          `${event.method} ${event.resource}`.slice(0, 64),
          event.resource,
          event.resourceId,
          JSON.stringify({
            request_id: event.requestId,
            method: event.method,
            resource_id: event.resourceId,
            status_code: event.statusCode,
          }),
        ],
      );
    } catch (error) {
      this.logger.warn(
        `Audit write failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
