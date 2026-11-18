import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { assertAnswerCodes, type AnswerQuestion } from './answer-rules.js';

export interface FormAnswerInput {
  question_key: string;
  option_codes: string[];
  text_value?: string | null;
}

export interface FormQuestion extends AnswerQuestion {
  required: boolean;
}

/** Question 7 answers that mean "yes, I reacted", the only ones that can carry the optional free-text follow-up. */
const REACTION_YES_CODES = ['knows_ingredient', 'unknown_cause'];

/** The free text sent with the form, trimmed and by question. Blank text counts as no text. */
export function assertFormTexts(
  answers: FormAnswerInput[],
): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const answer of answers) {
    const text = answer.text_value?.trim();
    if (!text) {
      continue;
    }
    const allowed =
      answer.question_key === 'reaction_history' &&
      answer.option_codes.some((code) => REACTION_YES_CODES.includes(code));
    if (!allowed) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Details are only accepted when a skincare reaction is reported.',
        [{ question_key: answer.question_key }],
      );
    }
    texts[answer.question_key] = text;
  }
  return texts;
}

export function assertOnboardingForm(
  questions: FormQuestion[],
  answers: FormAnswerInput[],
): Record<string, string[]> {
  const byKey = new Map(questions.map((question) => [question.key, question]));
  const selected: Record<string, string[]> = {};
  for (const answer of answers) {
    if (selected[answer.question_key]) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Each question can be submitted once.',
        [{ question_key: answer.question_key }],
      );
    }
    const question = byKey.get(answer.question_key);
    if (!question) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.QUESTION_VERSION_MISMATCH,
        'That question is not on this questionnaire version.',
        [{ question_key: answer.question_key }],
      );
    }
    assertAnswerCodes(question, answer.option_codes);
    selected[answer.question_key] = answer.option_codes;
  }
  const missing = questions
    .filter((question) => question.required && !selected[question.key])
    .map((question) => question.key);
  if (missing.length > 0) {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.ANSWERS_INCOMPLETE,
      'Answer every required question before saving onboarding.',
      missing.map((question_key) => ({ question_key })),
    );
  }
  return selected;
}
