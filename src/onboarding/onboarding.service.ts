import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { UsersService } from '../users/users.service.js';
import type {
  ActiveQuestionnaireDto,
  OnboardingFormResponseDto,
  SubmitOnboardingFormDto,
} from './dto/onboarding.dto.js';
import { assertFormTexts, assertOnboardingForm } from './form-rules.js';
import { OnboardingRepository } from './onboarding.repository.js';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly onboarding: OnboardingRepository,
    private readonly users: UsersService,
  ) {}

  async getActiveQuestionnaire(): Promise<ActiveQuestionnaireDto> {
    const questionnaire = await this.activeQuestionnaire();
    return questionnaire;
  }

  async submitForm(
    user: AuthenticatedUser,
    input: SubmitOnboardingFormDto,
  ): Promise<OnboardingFormResponseDto> {
    await this.users.getMe(user);
    const questionnaire = await this.activeQuestionnaire();
    const answers = assertOnboardingForm(
      questionnaire.questions.map((question) => ({
        key: question.key,
        required: question.required,
        selectionMode: question.selection_mode,
        minSelections: question.min_selections,
        maxSelections: question.max_selections,
        allowedCodes: question.options.map((option) => option.code),
      })),
      input.answers,
    );
    const texts = assertFormTexts(input.answers);
    const saved = await this.onboarding.saveCompletedForm({
      userId: user.id,
      definitionId: questionnaire.id,
      version: questionnaire.version,
      answers,
      texts,
    });
    return this.toForm(
      saved.submissionId,
      questionnaire.version,
      answers,
      texts,
    );
  }

  async latestForm(
    user: AuthenticatedUser,
  ): Promise<OnboardingFormResponseDto> {
    const submission = await this.onboarding.findLatestForUser(user.id);
    if (!submission || submission.userId !== user.id) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'No onboarding form was found.',
      );
    }
    const answers = await this.onboarding.listAnswers(submission.id);
    const texts = await this.onboarding.listAnswerTexts(submission.id);
    return this.toForm(submission.id, submission.version, answers, texts);
  }

  private async activeQuestionnaire(): Promise<ActiveQuestionnaireDto> {
    const questionnaire = await this.onboarding.getActiveQuestionnaire();
    if (!questionnaire) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'No active onboarding questionnaire is published.',
      );
    }
    return questionnaire;
  }

  private toForm(
    submissionId: string,
    version: number,
    answers: Record<string, string[]>,
    texts: Record<string, string>,
  ): OnboardingFormResponseDto {
    return {
      submission_id: submissionId,
      status: 'completed',
      questionnaire_version: version,
      answers: Object.entries(answers).map(([question_key, option_codes]) => ({
        question_key,
        option_codes,
        ...(texts[question_key] ? { text_value: texts[question_key] } : {}),
      })),
      face_scan_opt_in: answers.face_scan_opt_in?.[0] ?? null,
    };
  }
}
