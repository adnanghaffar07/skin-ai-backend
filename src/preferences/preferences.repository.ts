import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type {
  PreferencesResponseDto,
  UpdatePreferencesDto,
} from './dto/preferences.dto.js';

interface PreferenceRow extends QueryResultRow {
  primary_goal: string | null;
  monthly_budget_band: string | null;
  morning_time: string | null;
  evening_time: string | null;
  next_scan_on: string | null;
  goal_codes: string[] | null;
  avoid_codes: string[] | null;
  category_codes: string[] | null;
}

@Injectable()
export class PreferencesRepository {
  constructor(private readonly database: DatabaseService) {}

  async get(userId: string): Promise<PreferencesResponseDto> {
    const rows = await this.database.query<PreferenceRow>(
      `
      select
        p.primary_goal,
        p.monthly_budget_band,
        to_char(p.morning_time, 'HH24:MI') as morning_time,
        to_char(p.evening_time, 'HH24:MI') as evening_time,
        p.next_scan_on::text as next_scan_on,
        coalesce(
          (select json_agg(g.goal_code order by g.goal_code) from public.user_preference_goals g where g.user_id = $1),
          '[]'::json
        ) as goal_codes,
        coalesce(
          (select json_agg(s.sensitivity_code order by s.sensitivity_code) from public.skin_profile_sensitivities s where s.user_id = $1),
          '[]'::json
        ) as avoid_codes,
        coalesce(
          (select json_agg(c.category_code order by c.category_code) from public.user_preference_categories c where c.user_id = $1),
          '[]'::json
        ) as category_codes
      from (select $1::uuid as user_id) owner
      left join public.user_preferences p on p.user_id = owner.user_id
      `,
      [userId],
    );
    const row = rows[0];
    return {
      goal_codes: row?.goal_codes ?? [],
      avoid_codes: row?.avoid_codes ?? [],
      morning_time: row?.morning_time ?? null,
      evening_time: row?.evening_time ?? null,
      next_scan_on: row?.next_scan_on ?? null,
      primary_goal: row?.primary_goal ?? null,
      monthly_budget_band: row?.monthly_budget_band ?? null,
      category_codes: row?.category_codes ?? [],
    };
  }

  async replace(
    userId: string,
    current: PreferencesResponseDto,
    input: UpdatePreferencesDto,
  ): Promise<void> {
    const morning = input.morning_time ?? current.morning_time;
    const evening = input.evening_time ?? current.evening_time;
    const nextScan = input.next_scan_on ?? current.next_scan_on;
    await this.database.transaction(async (db) => {
      await db.query(
        `
        insert into public.user_preferences
          (user_id, morning_time, evening_time, next_scan_on)
        values ($1, $2::time, $3::time, $4::date)
        on conflict (user_id) do update
          set morning_time = excluded.morning_time,
              evening_time = excluded.evening_time,
              next_scan_on = excluded.next_scan_on,
              updated_at = now()
        `,
        [userId, morning, evening, nextScan],
      );
      await db.query(
        `delete from public.user_preference_goals where user_id = $1`,
        [userId],
      );
      if (input.goal_codes.length > 0) {
        await db.query(
          `
          insert into public.user_preference_goals (user_id, goal_code)
          select $1, code from unnest($2::varchar[]) as code
          `,
          [userId, input.goal_codes],
        );
      }
      await db.query(
        `delete from public.skin_profile_sensitivities where user_id = $1`,
        [userId],
      );
      if (input.avoid_codes.length > 0) {
        await db.query(
          `
          insert into public.skin_profile_sensitivities (user_id, sensitivity_code)
          select $1, code from unnest($2::varchar[]) as code
          `,
          [userId, input.avoid_codes],
        );
      }
    });
  }
}
