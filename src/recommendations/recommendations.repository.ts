import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { Candidate, ProfileInput, RankedProduct } from './ranking.js';
import type { RoutineStepDraft } from './routine-template.js';

export interface SetRow extends QueryResultRow {
  id: string;
  basis: string;
  rule_version: string;
  limitations: string[];
  summary: string | null;
  budget_ceiling: string | null;
  safety: { refer_to_professional: boolean; reason: string | null } | null;
}

/** A product to save in a plan: rule-based picks have no explanation, AI picks may. */
export type PlanItem = Pick<RankedProduct, 'id' | 'variant_id' | 'rank' | 'currency_code' | 'amount' | 'reason_codes'> & {
  explanation?: string | null;
  guidance?: { periods: string[]; frequency: string | null; cautions: string[] } | null;
};

export interface AiRunRecord {
  userId: string;
  submissionId: string;
  setId: string | null;
  provider: string;
  status: 'succeeded' | 'failed';
  modelVersion: string | null;
  schemaVersion: string | null;
  confidence: string | null;
  returned: number;
  kept: number;
  latencyMs: number | null;
  errorCode: string | null;
}

const SET_COLUMNS = 'id, basis::text as basis, rule_version, limitations, summary, budget_ceiling::text as budget_ceiling, safety';

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
  guidance: { periods: string[]; frequency: string | null; cautions: string[] } | null;
  tier: 'budget' | 'best';
}

export interface ProfileContext extends ProfileInput {
  /** The submission exists and belongs to this user. */
  submission_found: boolean;
  submission_completed: boolean;
  routine_level: string | null;
  profile_market: string | null;
  age_range: string | null;
  sensitivity_level: string | null;
  reaction_history: string | null;
  /** The optional "which product or ingredient?" text under the reactions question. */
  reaction_details: string | null;
}

@Injectable()
export class RecommendationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async loadProfile(userId: string, submissionId: string): Promise<ProfileContext> {
    const rows = await this.database.query<ProfileContext>(
      `
      select
        exists (select 1 from public.questionnaire_submissions q
                where q.id = $2 and q.user_id = $1) as submission_found,
        exists (select 1 from public.questionnaire_submissions q
                where q.id = $2 and q.user_id = $1 and q.status = 'completed') as submission_completed,
        sp.self_reported_skin_type as skin_type,
        sp.current_routine_level as routine_level,
        sp.age_range,
        sp.sensitivity_level,
        sp.reaction_history,
        (select a.text_value from public.questionnaire_answers a
         join public.questionnaire_questions q on q.id = a.question_id
         join public.questionnaire_submissions s on s.id = a.submission_id
         where a.submission_id = $2 and s.user_id = $1 and q.key = 'reaction_history' and a.text_value is not null
         limit 1) as reaction_details,
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
      `select ${SET_COLUMNS}
       from public.recommendation_sets where user_id = $1 and idempotency_key = $2`,
      [userId, key],
    );
    return rows[0] ?? null;
  }

  async latest(userId: string): Promise<SetRow | null> {
    const rows = await this.database.query<SetRow>(
      `select ${SET_COLUMNS}
       from public.recommendation_sets where user_id = $1
       order by created_at desc, id desc limit 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  items(setId: string): Promise<ItemRow[]> {
    return this.database.query<ItemRow>(
      `select i.product_id, i.variant_id, i.rank, p.name, b.name as brand, p.category_code,
              i.currency_code, i.amount::text as amount, i.reason_codes, i.explanation, i.guidance, i.tier
       from public.recommendation_items i
       join public.products p on p.id = i.product_id
       join public.brands b on b.id = p.brand_id
       where i.recommendation_set_id = $1
       order by i.tier desc, i.rank`,
      [setId],
    );
  }

  /** Saves the set, its items, and the routine built from it in one transaction. Returns null when the idempotency key already exists. */
  save(input: {
    userId: string;
    submissionId: string;
    market: string;
    idempotencyKey: string;
    basis: 'self_reported' | 'ai_assisted';
    ruleVersion: string;
    summary: string | null;
    safety?: { refer_to_professional: boolean; reason: string | null } | null;
    plan: { products: PlanItem[]; best: PlanItem[]; budget_ceiling: number | null; limitations: string[] };
    steps: RoutineStepDraft[];
  }): Promise<SetRow | null> {
    return this.database.transaction(async (db) => {
      const created = await db.query<SetRow>(
        `insert into public.recommendation_sets
           (user_id, submission_id, basis, rule_version, market_code, idempotency_key, limitations, summary, budget_ceiling, safety)
         values ($1, $2, $3::public.recommendation_basis, $4, $5, $6, $7, $8, $9, $10::jsonb)
         on conflict do nothing
         returning ${SET_COLUMNS}`,
        [input.userId, input.submissionId, input.basis, input.ruleVersion.slice(0, 32), input.market, input.idempotencyKey, input.plan.limitations, input.summary, input.plan.budget_ceiling, input.safety ? JSON.stringify(input.safety) : null],
      );
      const set = created[0];
      if (!set) {
        return null;
      }
      const tiers = [
        ...input.plan.products.map((product) => ({ product, tier: 'budget' })),
        ...input.plan.best.map((product) => ({ product, tier: 'best' })),
      ];
      for (const { product, tier } of tiers) {
        await db.query(
          `insert into public.recommendation_items
             (recommendation_set_id, product_id, variant_id, rank, currency_code, amount, reason_codes, explanation, tier, guidance)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
          [set.id, product.id, product.variant_id, product.rank, product.currency_code, product.amount, product.reason_codes, product.explanation ?? null, tier, product.guidance ? JSON.stringify(product.guidance) : null],
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

  /** One row per call to the AI service, successful or not. Never fails the request that made it. */
  async recordAiRun(run: AiRunRecord): Promise<void> {
    await this.database.query(
      `insert into public.ai_recommendation_runs
         (user_id, submission_id, recommendation_set_id, provider, status, model_version, schema_version, confidence,
          products_returned, products_kept, latency_ms, error_code)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [run.userId, run.submissionId, run.setId, run.provider, run.status, run.modelVersion, run.schemaVersion, run.confidence, run.returned, run.kept, run.latencyMs, run.errorCode],
    );
  }
}
