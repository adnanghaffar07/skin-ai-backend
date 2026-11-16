import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { UsersService } from '../users/users.service.js';
import type {
  CreateRecommendationDto,
  RecommendationDto,
} from './dto/recommendation.dto.js';
import { buildPlan } from './ranking.js';
import {
  RecommendationsRepository,
  type SetRow,
} from './recommendations.repository.js';
import {
  buildRoutineSteps,
  EVENING_TITLE,
  MORNING_TITLE,
} from './routine-template.js';

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly users: UsersService,
    private readonly repo: RecommendationsRepository,
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
    const plan = buildPlan(await this.repo.candidates(market), profile);
    const saved = await this.repo.save({
      userId: user.id,
      submissionId: body.submission_id,
      market,
      idempotencyKey,
      plan,
      steps: buildRoutineSteps(plan.products, profile.routine_level),
    });
    const set =
      saved ?? (await this.repo.findByIdempotencyKey(user.id, idempotencyKey));
    if (!set) {
      throw new ApiException(409, ErrorCode.CONFLICT, 'Retry the request.');
    }
    return this.present(set);
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
    return {
      id: set.id,
      basis: set.basis,
      rule_version: set.rule_version,
      limitations: set.limitations,
      explanation_status: 'not_implemented',
      morning_title: MORNING_TITLE,
      evening_title: EVENING_TITLE,
      products: items.map((item) => ({
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
      })),
      snapshot: null,
    };
  }
}
