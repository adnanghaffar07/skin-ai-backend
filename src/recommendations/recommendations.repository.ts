import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { Candidate, Plan, ProfileInput } from './ranking.js';
import { RULE_VERSION } from './ranking.js';
import type { RoutineStepDraft } from './routine-template.js';

export interface SetRow extends QueryResultRow {
  id: string;
  basis: string;
  rule_version: string;
  limitations: string[];
}

export interface ItemRow extends QueryResultRow {
  product_id: string;
  variant_id: string;
  rank: number;
  name: string;
  brand: string;
  category_code: string;
  currency_code: string;
  amount: string;
  reason_codes: string[];
  explanation: string | null;
}

export interface ProfileContext extends ProfileInput {
  submission_completed: boolean;
  routine_level: string | null;
  profile_market: string | null;
}

@Injectable()
export class RecommendationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async loadProfile(userId: string, submissionId: string): Promise<ProfileContext> {
    const rows = await this.database.query<ProfileContext>(
      `
      select
        exists (select 1 from public.questionnaire_submissions q
                where q.id = $2 and q.user_id = $1 and q.status = 'completed') as submission_completed,
        sp.self_reported_skin_type as skin_type,
        sp.current_routine_level as routine_level,
        up.market_code as profile_market,
        pref.primary_goal,
        pref.monthly_budget_band as budget_band,
        coalesce((select array_agg(concern_code) from public.skin_profile_concerns where user_id = $1), '{}') as concerns,
        coalesce((select array_agg(goal_code) from public.user_preference_goals where user_id = $1), '{}') as goal_codes,
        coalesce((select array_agg(sensitivity_code) from public.skin_profile_sensitivities where user_id = $1), '{}') as avoid_codes,
        coalesce((select array_agg(category_code) from public.user_preference_categories where user_id = $1), '{}') as categories
      from (select 1) x
      left join public.skin_profiles sp on sp.user_id = $1
      left join public.user_profiles up on up.user_id = $1
      left join public.user_preferences pref on pref.user_id = $1
      `,
      [userId, submissionId],
    );
    return rows[0];
  }

  candidates(market: string): Promise<Candidate[]> {
    return this.database.query<Candidate>(
      `
      select
        p.id, v.id as variant_id, p.name, b.name as brand, p.category_code,
        price.currency_code, price.amount::float as amount,
        concat_ws(' ', p.name, p.benefits, p.suitable_for) as text,
        (select count(*) from public.product_ingredients pi where pi.product_id = p.id)::int as ingredient_count,
        coalesce((
          select array_agg(distinct r.restriction_code)
          from public.product_ingredients pi
          join public.ingredient_restrictions r on r.ingredient_id = pi.ingredient_id
          where pi.product_id = p.id
        ), '{}') as restriction_codes
      from public.products p
      join public.brands b on b.id = p.brand_id
      join public.product_market_availability a
        on a.product_id = p.id and a.market_code = $1 and a.is_available
      join lateral (
        select vv.id from public.product_variants vv
        join public.product_prices pr on pr.variant_id = vv.id and pr.market_code = $1
        where vv.product_id = p.id and vv.status = 'active'
          and pr.effective_from <= now() and (pr.effective_to is null or pr.effective_to > now())
        order by pr.amount asc limit 1
      ) v on true
      join lateral (
        select pr.currency_code, pr.amount from public.product_prices pr
        where pr.variant_id = v.id and pr.market_code = $1
          and pr.effective_from <= now() and (pr.effective_to is null or pr.effective_to > now())
        order by pr.effective_from desc limit 1
      ) price on true
      where p.status = 'active' and p.deleted_at is null
      `,
      [market],
    );
  }

  async findByIdempotencyKey(userId: string, key: string): Promise<SetRow | null> {
    const rows = await this.database.query<SetRow>(
      `select id, basis::text as basis, rule_version, limitations
       from public.recommendation_sets where user_id = $1 and idempotency_key = $2`,
      [userId, key],
    );
    return rows[0] ?? null;
  }

  async latest(userId: string): Promise<SetRow | null> {
    const rows = await this.database.query<SetRow>(
      `select id, basis::text as basis, rule_version, limitations
       from public.recommendation_sets where user_id = $1
       order by created_at desc, id desc limit 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  items(setId: string): Promise<ItemRow[]> {
    return this.database.query<ItemRow>(
      `select i.product_id, i.variant_id, i.rank, p.name, b.name as brand, p.category_code,
              i.currency_code, i.amount::text as amount, i.reason_codes, i.explanation
       from public.recommendation_items i
       join public.products p on p.id = i.product_id
       join public.brands b on b.id = p.brand_id
       where i.recommendation_set_id = $1
       order by i.rank`,
      [setId],
    );
  }

  /** Saves the set, its items, and the routine built from it in one transaction. Returns null when the idempotency key already exists. */
  save(input: {
    userId: string;
    submissionId: string;
    market: string;
    idempotencyKey: string;
    plan: Plan;
    steps: RoutineStepDraft[];
  }): Promise<SetRow | null> {
    return this.database.transaction(async (db) => {
      const created = await db.query<SetRow>(
        `insert into public.recommendation_sets
           (user_id, submission_id, basis, rule_version, market_code, idempotency_key, limitations)
         values ($1, $2, 'self_reported', $3, $4, $5, $6)
         on conflict do nothing
         returning id, basis::text as basis, rule_version, limitations`,
        [input.userId, input.submissionId, RULE_VERSION, input.market, input.idempotencyKey, input.plan.limitations],
      );
      const set = created[0];
      if (!set) {
        return null;
      }
      for (const product of input.plan.products) {
        await db.query(
          `insert into public.recommendation_items
             (recommendation_set_id, product_id, variant_id, rank, currency_code, amount, reason_codes)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [set.id, product.id, product.variant_id, product.rank, product.currency_code, product.amount, product.reason_codes],
        );
      }
      await db.query(
        `update public.skincare_routines set status = 'replaced' where user_id = $1 and status = 'active'`,
        [input.userId],
      );
      const routine = await db.query<{ id: string }>(
        `insert into public.skincare_routines (user_id, recommendation_set_id, version, routine_date)
         select $1, $2, coalesce(max(version), 0) + 1, current_date
         from public.skincare_routines where user_id = $1
         returning id`,
        [input.userId, set.id],
      );
      for (const step of input.steps) {
        await db.query(
          `insert into public.skincare_routine_steps
             (routine_id, period, position, product_id, step_type, title, duration_label)
           values ($1, $2::public.routine_period, $3, $4, $5::public.routine_step_type, $6, $7)`,
          [routine[0].id, step.period, step.position, step.product_id, step.step_type, step.title, step.duration_label],
        );
      }
      return set;
    });
  }
}
