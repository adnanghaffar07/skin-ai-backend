import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';

export interface ScanRow extends QueryResultRow {
  id: string;
  status: string;
  submitted_at: Date | null;
  created_at: Date;
  has_image: boolean;
}

export interface ImageRow extends QueryResultRow {
  object_key: string;
  content_type: string;
  byte_size: number;
}

export interface EligibilityRow extends QueryResultRow {
  age_range: string | null;
  consent_id: string | null;
  birth_date: string | null;
  submission_found: boolean;
  submission_completed: boolean;
  face_scan_opt_in: string | null;
}

const SCAN_COLUMNS = `
  s.id, s.status::text as status, s.submitted_at, s.created_at,
  exists (select 1 from public.scan_images i where i.scan_id = s.id and i.deleted_at is null) as has_image
`;

@Injectable()
export class ScansRepository {
  constructor(private readonly database: DatabaseService) {}

  async eligibility(
    userId: string,
    submissionId: string,
  ): Promise<EligibilityRow> {
    const rows = await this.database.query<EligibilityRow>(
      `
      select
        (select age_range from public.skin_profiles where user_id = $1) as age_range,
        (select birth_date::text from public.user_profiles where user_id = $1) as birth_date,
        (
          select latest.id from (
            select c.id, c.granted, c.revoked_at from public.consent_records c
            where c.user_id = $1 and c.purpose = 'facial_image_processing'
            order by c.granted_at desc limit 1
          ) latest
          where latest.granted and latest.revoked_at is null
        ) as consent_id,
        exists (
          select 1 from public.questionnaire_submissions q where q.id = $2 and q.user_id = $1
        ) as submission_found,
        exists (
          select 1 from public.questionnaire_submissions q
          where q.id = $2 and q.user_id = $1 and q.status = 'completed'
        ) as submission_completed,
        (
          select o.code
          from public.questionnaire_answers a
          join public.questionnaire_questions qq on qq.id = a.question_id
          join public.questionnaire_options o on o.id = a.option_id
          where a.submission_id = $2 and qq.key = 'face_scan_opt_in'
          limit 1
        ) as face_scan_opt_in
      `,
      [userId, submissionId],
    );
    return rows[0];
  }

  /** Whether the latest facial-image consent is a grant. Withdrawing is a newer record, so the latest one decides. */
  async hasLiveConsent(
    userId: string,
    purpose: 'facial_image_processing' | 'ai_model_training' = 'facial_image_processing',
  ): Promise<boolean> {
    const rows = await this.database.query<{ live: boolean }>(
      `select coalesce((
         select c.granted and c.revoked_at is null
         from public.consent_records c
         where c.user_id = $1 and c.purpose = $2::public.consent_purpose
         order by c.granted_at desc limit 1
       ), false) as live`,
      [userId, purpose],
    );
    return rows[0]?.live === true;
  }

  async findByIdempotencyKey(
    userId: string,
    key: string,
  ): Promise<ScanRow | null> {
    const rows = await this.database.query<ScanRow>(
      `select ${SCAN_COLUMNS} from public.scan_sessions s
       where s.user_id = $1 and s.idempotency_key = $2 and s.deleted_at is null`,
      [userId, key],
    );
    return rows[0] ?? null;
  }

  /** Returns null when the same idempotency key was inserted concurrently. */
  async create(
    userId: string,
    submissionId: string,
    consentId: string,
    idempotencyKey: string,
  ): Promise<ScanRow | null> {
    const rows = await this.database.query<ScanRow>(
      `
      with created as (
        insert into public.scan_sessions (user_id, submission_id, consent_id, idempotency_key)
        values ($1, $2, $3, $4)
        on conflict do nothing
        returning id
      )
      select ${SCAN_COLUMNS} from public.scan_sessions s join created c on c.id = s.id
      `,
      [userId, submissionId, consentId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async get(userId: string, scanId: string): Promise<ScanRow | null> {
    const rows = await this.database.query<ScanRow>(
      `select ${SCAN_COLUMNS} from public.scan_sessions s
       where s.id = $1 and s.user_id = $2 and s.deleted_at is null`,
      [scanId, userId],
    );
    return rows[0] ?? null;
  }

  async list(userId: string): Promise<ScanRow[]> {
    return this.database.query<ScanRow>(
      `select ${SCAN_COLUMNS} from public.scan_sessions s
       where s.user_id = $1 and s.deleted_at is null
       order by s.created_at desc limit 100`,
      [userId],
    );
  }

  async getImage(scanId: string): Promise<ImageRow | null> {
    const rows = await this.database.query<ImageRow>(
      `select object_key, content_type, byte_size from public.scan_images
       where scan_id = $1 and deleted_at is null`,
      [scanId],
    );
    return rows[0] ?? null;
  }

  async saveImage(
    scanId: string,
    image: {
      provider: string;
      bucket: string;
      objectKey: string;
      contentType: string;
      byteSize: number;
    },
  ): Promise<void> {
    await this.database.query(
      `
      insert into public.scan_images (scan_id, storage_provider, bucket, object_key, content_type, byte_size)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (scan_id) do update set
        storage_provider = excluded.storage_provider,
        bucket = excluded.bucket,
        object_key = excluded.object_key,
        content_type = excluded.content_type,
        byte_size = excluded.byte_size,
        deleted_at = null
      `,
      [
        scanId,
        image.provider,
        image.bucket,
        image.objectKey,
        image.contentType,
        image.byteSize,
      ],
    );
  }

  async deleteImage(scanId: string): Promise<void> {
    await this.database.query(
      `delete from public.scan_images where scan_id = $1`,
      [scanId],
    );
  }

  /** Moves awaiting_upload to ready_for_analysis. Returns null if the scan was not in that state. */
  async markSubmitted(
    scanId: string,
    byteSize: number,
    quality: Record<string, number | boolean> | null = null,
  ): Promise<{ submitted_at: Date } | null> {
    return this.database.transaction(async (db) => {
      const rows = await db.query<{ submitted_at: Date }>(
        `update public.scan_sessions
         set status = 'ready_for_analysis', submitted_at = now(), updated_at = now()
         where id = $1 and status = 'awaiting_upload' and deleted_at is null
         returning submitted_at`,
        [scanId],
      );
      if (!rows[0]) {
        return null;
      }
      await db.query(
        `update public.scan_images set byte_size = $2, quality = $3 where scan_id = $1`,
        [scanId, byteSize, quality === null ? null : JSON.stringify(quality)],
      );
      return rows[0];
    });
  }

  async cancel(scanId: string): Promise<void> {
    await this.database.transaction(async (db) => {
      await db.query(`delete from public.scan_images where scan_id = $1`, [
        scanId,
      ]);
      await db.query(
        `update public.scan_sessions
         set status = 'cancelled', deleted_at = now(), updated_at = now()
         where id = $1`,
        [scanId],
      );
    });
  }
}
