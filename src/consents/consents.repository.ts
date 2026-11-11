import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { CreateConsentDto } from './dto/create-consent.dto.js';
import type { ConsentResponseDto } from './dto/consent-response.dto.js';

interface ConsentRow extends QueryResultRow {
  id: string;
  purpose: string;
  policy_version: string;
  granted: boolean;
  granted_at: Date;
  revoked_at: Date | null;
  source: string;
}

@Injectable()
export class ConsentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    userId: string,
    input: CreateConsentDto,
  ): Promise<ConsentResponseDto> {
    const rows = await this.database.query<ConsentRow>(
      `
      insert into public.consent_records
        (user_id, purpose, policy_version, granted, revoked_at, source)
      values ($1, $2::public.consent_purpose, $3, $4, case when $4 then null else now() end, $5)
      returning id, purpose::text as purpose, policy_version, granted, granted_at, revoked_at, source
      `,
      [userId, input.purpose, input.policy_version, input.granted, input.source],
    );
    return toConsent(rows[0]);
  }

  async list(userId: string): Promise<ConsentResponseDto[]> {
    const rows = await this.database.query<ConsentRow>(
      `
      select id, purpose::text as purpose, policy_version, granted, granted_at, revoked_at, source
      from public.consent_records
      where user_id = $1
      order by granted_at desc
      `,
      [userId],
    );
    return rows.map(toConsent);
  }
}

function toConsent(row: ConsentRow): ConsentResponseDto {
  return {
    id: row.id,
    purpose: row.purpose,
    policy_version: row.policy_version,
    granted: row.granted,
    granted_at: new Date(row.granted_at).toISOString(),
    revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    source: row.source,
  };
}
