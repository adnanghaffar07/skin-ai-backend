import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

/** Everything stored about one person, grouped the way they would recognise it. Internal keys and tokens are left out. */
const EXPORT_SQL = `
select json_build_object(
  'account', (select row_to_json(x) from (
    select u.id, u.email, u.role, u.status, u.created_at from public.users u where u.id = $1) x),
  'profile', (select row_to_json(x) from (
    select display_name, birth_date, state_province, address_line, market_code, locale, created_at, updated_at
    from public.user_profiles where user_id = $1) x),
  'consents', coalesce((select json_agg(x order by x.granted_at) from (
    select purpose, policy_version, granted, granted_at, revoked_at, source
    from public.consent_records where user_id = $1) x), '[]'),
  'skin_profile', (select row_to_json(x) from (
    select age_range, self_reported_skin_type, sensitivity_level, current_routine_level, reaction_history, updated_at
    from public.skin_profiles where user_id = $1) x),
  'concerns', coalesce((select json_agg(concern_code) from public.skin_profile_concerns where user_id = $1), '[]'),
  'ingredients_to_avoid', coalesce((select json_agg(sensitivity_code) from public.skin_profile_sensitivities where user_id = $1), '[]'),
  'preferences', (select row_to_json(x) from (
    select primary_goal, monthly_budget_band, morning_time, evening_time, next_scan_on, updated_at
    from public.user_preferences where user_id = $1) x),
  'goals', coalesce((select json_agg(goal_code) from public.user_preference_goals where user_id = $1), '[]'),
  'product_interests', coalesce((select json_agg(category_code) from public.user_preference_categories where user_id = $1), '[]'),
  'questionnaires', coalesce((select json_agg(x order by x.created_at) from (
    select s.id, s.status, s.created_at, s.completed_at,
      coalesce((select json_agg(json_build_object('question', q.key, 'answer', o.code, 'details', a.text_value)
                                order by q.position, o.position)
                from public.questionnaire_answers a
                join public.questionnaire_questions q on q.id = a.question_id
                left join public.questionnaire_options o on o.id = a.option_id
                where a.submission_id = s.id), '[]') as answers
    from public.questionnaire_submissions s where s.user_id = $1) x), '[]'),
  'scans', coalesce((select json_agg(x order by x.created_at) from (
    select sc.id, sc.status, sc.created_at, sc.submitted_at,
      exists (select 1 from public.scan_images i where i.scan_id = sc.id and i.deleted_at is null) as has_photo
    from public.scan_sessions sc where sc.user_id = $1 and sc.deleted_at is null) x), '[]'),
  'skin_assessments', coalesce((select json_agg(x order by x.created_at) from (
    select a.id, a.scan_id, a.status, a.summary, a.limitations, a.created_at,
      coalesce((select json_agg(json_build_object('feature', o.feature_code, 'intensity', o.intensity,
                                                  'location', o.location_note, 'score', o.score))
                from public.assessment_observations o where o.assessment_id = a.id), '[]') as observations
    from public.skin_assessments a where a.user_id = $1) x), '[]'),
  'recommendations', coalesce((select json_agg(x order by x.created_at) from (
    select r.id, r.basis, r.market_code, r.created_at,
      coalesce((select json_agg(json_build_object('product_id', i.product_id, 'rank', i.rank, 'price', i.amount,
                                                  'currency', i.currency_code, 'reasons', i.reason_codes) order by i.rank)
                from public.recommendation_items i where i.recommendation_set_id = r.id), '[]') as products
    from public.recommendation_sets r where r.user_id = $1) x), '[]'),
  'routines', coalesce((select json_agg(x order by x.created_at) from (
    select rt.id, rt.status, rt.routine_date, rt.created_at,
      coalesce((select json_agg(json_build_object('period', st.period, 'position', st.position, 'title', st.title,
                                                  'product_id', st.product_id) order by st.period, st.position)
                from public.skincare_routine_steps st where st.routine_id = rt.id), '[]') as steps
    from public.skincare_routines rt where rt.user_id = $1) x), '[]'),
  'routine_completions', coalesce((select json_agg(x order by x.completed_at) from (
    select step_id, completed_on, completed_at from public.routine_step_completions where user_id = $1) x), '[]'),
  'progress', coalesce((select json_agg(x order by x.captured_on) from (
    select scan_id, captured_on, overall_score from public.progress_entries where user_id = $1) x), '[]'),
  'diary', coalesce((select json_agg(x order by x.entry_date) from (
    select entry_date, skin_feel, concerns, morning_routine_done, evening_routine_done, new_products,
      reaction, reaction_note, notes, created_at, updated_at
    from public.diary_entries where user_id = $1) x), '[]'),
  'scan_results', coalesce((select json_agg(x order by x.analysed_at) from (
    select client_id, analysed_at, source, metrics, issues from public.scan_results where user_id = $1) x), '[]'),
  'profile_photo', (select avatar_object_key is not null from public.user_profiles where user_id = $1),
  'saved_lists', (select json_build_object('wishlist', wishlist, 'cart', cart) from public.user_saved_lists where user_id = $1),
  'consultation_notes', coalesce((select json_agg(x order by x.visited_on) from (
    select doctor_name, visited_on, title, notes, photo_object_key is not null as has_photo, created_at
    from public.consultation_notes where user_id = $1) x), '[]'),
  'reviews', coalesce((select json_agg(x order by x.created_at) from (
    select product_id, rating, body, created_at, updated_at from public.product_reviews where user_id = $1) x), '[]'),
  'app_events', coalesce((select json_agg(x order by x.occurred_at) from (
    select name, occurred_at, platform, app_version, country, properties
    from public.analytics_events where user_id = $1) x), '[]')
) as data`;

@Injectable()
export class AccountRepository {
  constructor(private readonly database: DatabaseService) {}

  async exportData(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.database.query<{ data: Record<string, unknown> }>(EXPORT_SQL, [userId]);
    return rows[0].data;
  }

  /** Storage keys of every photo the person still has, so they can be removed before the rows that point at them. */
  /** Objects in the user-media bucket that belong to the person (profile photo, consultation note photos). */
  async mediaKeys(userId: string): Promise<string[]> {
    const rows = await this.database.query<{ key: string | null }>(
      `select avatar_object_key as key from public.user_profiles where user_id = $1
       union all
       select photo_object_key from public.consultation_notes where user_id = $1
       union all
       select doctor_photo_object_key from public.consultation_notes where user_id = $1`,
      [userId],
    );
    return rows.map(row => row.key).filter((key): key is string => !!key);
  }

  async photoKeys(userId: string): Promise<string[]> {
    const rows = await this.database.query<{ object_key: string }>(
      `
      select i.object_key
      from public.scan_images i
      join public.scan_sessions s on s.id = i.scan_id
      where s.user_id = $1 and i.deleted_at is null
      `,
      [userId],
    );
    return rows.map((row) => row.object_key);
  }

  /** Runs supabase/migrations/20261120110000_delete_user_account.sql: every row, then the sign-in itself, in one transaction. */
  async deleteAccount(userId: string): Promise<void> {
    await this.database.query('select public.delete_user_account($1::uuid)', [userId]);
  }
}
