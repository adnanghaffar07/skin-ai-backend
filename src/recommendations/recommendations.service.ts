import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AiRecommender, AiServiceError } from '../ai/ai-recommender.js';
import { MARKUP_BP } from '../ai/ai.module.js';
import { ProductIntakeRepository } from '../ai/product-intake.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { UsersService } from '../users/users.service.js';
import type {
  CreateRecommendationDto,
  RecommendationDto,
} from './dto/recommendation.dto.js';
import { planFromAi, routineProducts, toAiRequest } from './ai-plan.js';
import { buildPlan, RULE_VERSION, type RankedProduct } from './ranking.js';
import {
  RecommendationsRepository,
  type AiRunRecord,
  type ItemRow,
  type ProfileContext,
  type SetRow,
} from './recommendations.repository.js';
import {
  buildRoutineSteps,
  EVENING_TITLE,
  MORNING_TITLE,
} from './routine-template.js';

const sumCents = (items: ItemRow[]) => items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
const firstPerCategory = (items: ItemRow[]) => items.filter((item, index) => items.findIndex((other) => other.category_code === item.category_code) === index);

/**
 * What the plan costs per month against the person's budget: the routine (first pick of each category) within budget,
 * and the best routine regardless of price.
 */
export function budgetSummary(ceiling: string | null, inBudget: ItemRow[], best: ItemRow[]) {
  const routine = sumCents(firstPerCategory(inBudget));
  const bestRoutine = sumCents(best);
  return {
    ceiling,
    currency_code: inBudget[0]?.currency_code ?? best[0]?.currency_code ?? null,
    routine_total: (routine / 100).toFixed(2),
    best_total: (bestRoutine / 100).toFixed(2),
    within_budget: ceiling === null || routine <= Math.round(Number(ceiling) * 100),
    best_exceeds_budget: ceiling !== null && bestRoutine > Math.round(Number(ceiling) * 100),
  };
}

/** The currency the AI service is asked to price in, per market. A market not listed here uses Clara's own rules. */
const MARKET_CURRENCY: Record<string, string> = { US: 'USD' };

type PlanProduct = RankedProduct & { explanation?: string | null };

interface BuiltPlan {
  basis: 'self_reported' | 'ai_assisted';
  ruleVersion: string;
  summary: string | null;
  plan: { products: PlanProduct[]; best: PlanProduct[]; budget_ceiling: number | null; limitations: string[] };
  /** Present when the AI service was called. */
  run?: Omit<AiRunRecord, 'userId' | 'submissionId' | 'setId'>;
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly users: UsersService,
    private readonly repo: RecommendationsRepository,
    @Optional() @Inject(AiRecommender) private readonly ai: AiRecommender | null = null,
    @Optional() private readonly intake: ProductIntakeRepository | null = null,
    @Optional() @Inject(MARKUP_BP) private readonly markupBp: number = 850,
  ) {}

  async create(
    user: AuthenticatedUser,
    idempotencyKey: string | undefined,
    body: CreateRecommendationDto,
  ): Promise<RecommendationDto> {
    if (!idempotencyKey || idempotencyKey.length > 64) {
      throw new ApiException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Idempotency-Key header is required (max 64 characters).',
      );
    }
    await this.users.getMe(user);
    const existing = await this.repo.findByIdempotencyKey(user.id, idempotencyKey);
    if (existing) {
      return this.present(existing);
    }
    const profile = await this.repo.loadProfile(user.id, body.submission_id);
    if (!profile.submission_found) {
      throw new ApiException(
        404,
        ErrorCode.NOT_FOUND,
        'Questionnaire submission not found.',
      );
    }
    if (!profile.submission_completed) {
      throw new ApiException(
        422,
        ErrorCode.ANSWERS_INCOMPLETE,
        'Onboarding must be completed before recommendations.',
      );
    }
    const market = body.market_code ?? profile.profile_market;
    if (!market) {
      throw new ApiException(
        422,
        ErrorCode.MARKET_REQUIRED,
        'Pass market_code or set a market on the profile.',
      );
    }
    const built = await this.build(profile, market);
    const saved = await this.repo.save({
      userId: user.id,
      submissionId: body.submission_id,
      market,
      idempotencyKey,
      basis: built.basis,
      ruleVersion: built.ruleVersion,
      summary: built.summary,
      plan: built.plan,
      steps: buildRoutineSteps(routineProducts(built.plan.products), profile.routine_level),
    });
    if (built.run) {
      await this.repo
        .recordAiRun({ ...built.run, userId: user.id, submissionId: body.submission_id, setId: saved?.id ?? null })
        .catch((error: unknown) => this.logger.warn(`AI run could not be recorded: ${String(error)}`));
    }
    const set =
      saved ?? (await this.repo.findByIdempotencyKey(user.id, idempotencyKey));
    if (!set) {
      throw new ApiException(409, ErrorCode.CONFLICT, 'Retry the request.');
    }
    return this.present(set);
  }

  /**
   * The AI service's picks when it is configured and answers with something usable; otherwise Clara's own rules over
   * the products already saved, with a limitation saying why.
   */
  private async build(profile: ProfileContext, market: string): Promise<BuiltPlan> {
    const rules = async (reasons: string[]): Promise<BuiltPlan> => {
      const plan = buildPlan(await this.repo.candidates(market), profile);
      return {
        basis: 'self_reported',
        ruleVersion: RULE_VERSION,
        summary: null,
        plan: { ...plan, limitations: [...new Set([...plan.limitations, ...reasons])].sort() },
      };
    };
    const currency = MARKET_CURRENCY[market];
    if (!this.ai || !this.intake || !currency) {
      return rules([]);
    }
    const provider = this.ai.provider;
    try {
      const result = await this.ai.recommend(toAiRequest(profile, market, currency, randomUUID()));
      const found = result.response.products;
      const saved = await this.intake.save(found, market, this.markupBp, provider === 'stub' ? 'stub' : 'ai');
      const plan = planFromAi(found, saved, profile);
      const run: BuiltPlan['run'] = {
        provider,
        status: 'succeeded',
        modelVersion: result.response.model_version,
        schemaVersion: result.response.schema_version,
        confidence: result.response.confidence,
        returned: found.length + result.dropped.length,
        kept: plan.products.length,
        latencyMs: result.latencyMs,
        errorCode: null,
      };
      if (plan.products.length === 0) {
        return { ...(await rules(['ai_no_usable_products'])), run };
      }
      return {
        basis: 'ai_assisted',
        ruleVersion: `ai:${result.response.model_version ?? provider}`,
        summary: result.response.summary,
        // Clara's codes first, then the AI service's own sentences.
        plan: { ...plan, limitations: [...plan.limitations, ...result.response.limitations] },
        run,
      };
    } catch (error) {
      const code = error instanceof AiServiceError ? error.code : 'AI_INTAKE_FAILED';
      this.logger.warn(`AI recommendation failed (${code}): ${error instanceof Error ? error.message : String(error)}`);
      const run: BuiltPlan['run'] = { provider, status: 'failed', modelVersion: null, schemaVersion: null, confidence: null, returned: 0, kept: 0, latencyMs: null, errorCode: code };
      return { ...(await rules(['ai_unavailable'])), run };
    }
  }

  async latest(user: AuthenticatedUser): Promise<RecommendationDto> {
    await this.users.getMe(user);
    const set = await this.repo.latest(user.id);
    if (!set) {
      throw new ApiException(
        404,
        ErrorCode.NOT_FOUND,
        'No recommendation has been created yet.',
      );
    }
    return this.present(set);
  }

  private async present(set: SetRow): Promise<RecommendationDto> {
    const items = await this.repo.items(set.id);
    const toDto = (item: ItemRow) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      rank: item.rank,
      name: item.name,
      brand: item.brand,
      category_code: item.category_code,
      currency_code: item.currency_code,
      amount: item.amount,
      reason_codes: item.reason_codes,
      explanation: item.explanation,
    });
    const inBudget = items.filter((item) => item.tier !== 'best');
    const best = items.filter((item) => item.tier === 'best');
    return {
      id: set.id,
      basis: set.basis,
      rule_version: set.rule_version,
      limitations: set.limitations,
      summary: set.summary,
      explanation_status: set.basis === 'ai_assisted' ? 'ai' : 'not_implemented',
      morning_title: MORNING_TITLE,
      evening_title: EVENING_TITLE,
      products: inBudget.map(toDto),
      best_products: best.map(toDto),
      budget: budgetSummary(set.budget_ceiling, inBudget, best),
      snapshot: null,
    };
  }
}
