import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { MeResponseDto } from './dto/me-response.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

interface ProfileRow extends QueryResultRow {
  id: string;
  email: string | null;
  role: string;
  status: string;
  deleted_at: Date | null;
  display_name: string | null;
  birth_date: string | null;
  state_province: string | null;
  address_line: string | null;
  market_code: string | null;
  locale: string | null;
  self_reported_skin_type: string | null;
  concerns: string[] | null;
  last_scan_at: Date | null;
  onboarding_status: string | null;
  submission_id: string | null;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async upsertAndLoad(user: AuthenticatedUser): Promise<MeResponseDto> {
    try {
      const rows = await this.database.query<ProfileRow>(
        `
        with upserted as (
          insert into public.users (id, email)
          values ($1, $2)
          on conflict (id) do update
            set email = coalesce(excluded.email, public.users.email),
                updated_at = now()
          returning id, email::text as email, role::text as role, status::text as status, deleted_at
        ),
        ensured as (
          insert into public.user_profiles (user_id, display_name)
          select id, $3 from upserted
          on conflict (user_id) do update
            set display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
                updated_at = now()
          returning user_id
        )
        select
          u.id,
          u.email,
          u.role,
          u.status,
          u.deleted_at,
          p.display_name,
          p.birth_date::text as birth_date,
          p.state_province,
          p.address_line,
          trim(p.market_code) as market_code,
          p.locale,
          sp.self_reported_skin_type,
          coalesce(
            (
              select json_agg(c.concern_code order by c.concern_code)
              from public.skin_profile_concerns c
              where c.user_id = u.id
            ),
            '[]'::json
          ) as concerns,
          (
            select max(s.submitted_at)
            from public.scan_sessions s
            where s.user_id = u.id and s.deleted_at is null
          ) as last_scan_at,
          sub.status as onboarding_status,
          sub.id as submission_id
        from upserted u
        join ensured e on e.user_id = u.id
        join public.user_profiles p on p.user_id = u.id
        left join public.skin_profiles sp on sp.user_id = u.id
        left join lateral (
          select qs.id, qs.status::text as status
          from public.questionnaire_submissions qs
          where qs.user_id = u.id
          order by qs.created_at desc
          limit 1
        ) sub on true
        `,
        [user.id, user.email, user.displayName],
      );
      const row = rows[0];
      if (!row) {
        throw new ApiException(
          500,
          ErrorCode.INTERNAL_ERROR,
          'An unexpected error occurred.',
        );
      }
      return toMe(row);
    } catch (error) {
      if (isPgCode(error, '23503')) {
        throw new ApiException(
          401,
          ErrorCode.UNAUTHENTICATED,
          'This access token does not match a Supabase account.',
        );
      }
      throw error;
    }
  }

  async updateProfile(
    userId: string,
    patch: UpdateProfileDto,
  ): Promise<void> {
    const assignments: string[] = [];
    const params: unknown[] = [userId];
    const fields: Array<[keyof UpdateProfileDto, string]> = [
      ['display_name', 'display_name'],
      ['birth_date', 'birth_date'],
      ['state_province', 'state_province'],
      ['address_line', 'address_line'],
      ['market_code', 'market_code'],
      ['locale', 'locale'],
    ];
    for (const [key, column] of fields) {
      if (patch[key] !== undefined) {
        params.push(patch[key]);
        const cast = key === 'birth_date' ? '::date' : '';
        assignments.push(`${column} = $${params.length}${cast}`);
      }
    }
    if (assignments.length === 0) {
      return;
    }
    assignments.push('updated_at = now()');
    await this.database.query(
      `update public.user_profiles set ${assignments.join(', ')} where user_id = $1`,
      params,
    );
  }
}

export function toMe(row: ProfileRow): MeResponseDto {
  if (row.deleted_at || row.status !== 'active') {
    throw new ApiException(
      403,
      ErrorCode.FORBIDDEN,
      'This account is disabled.',
    );
  }
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    display_name: row.display_name,
    birth_date: row.birth_date,
    state_province: row.state_province,
    address_line: row.address_line,
    avatar_url: null,
    market_code: row.market_code,
    locale: row.locale ?? 'en',
    skin: {
      self_reported_skin_type: row.self_reported_skin_type,
      concerns: row.concerns ?? [],
      last_scan_at: row.last_scan_at
        ? new Date(row.last_scan_at).toISOString()
        : null,
    },
    onboarding: {
      status: row.onboarding_status ?? 'not_started',
      submission_id: row.submission_id,
    },
  };
}

function isPgCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}
