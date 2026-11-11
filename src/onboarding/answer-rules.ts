import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';

export interface AnswerQuestion {
  key: string;
  selectionMode: string;
  minSelections: number | null;
  maxSelections: number | null;
  allowedCodes: string[];
}

export function assertAnswerCodes(
  question: AnswerQuestion,
  optionCodes: string[],
): void {
  if (question.selectionMode !== 'single' && question.selectionMode !== 'multi') {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.QUESTION_VERSION_MISMATCH,
      'This question does not accept option codes on the active version.',
      [{ question_key: question.key }],
    );
  }
  if (new Set(optionCodes).size !== optionCodes.length) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Each option can be selected once.',
      [{ question_key: question.key }],
    );
  }
  const unknown = optionCodes.filter(
    (code) => !question.allowedCodes.includes(code),
  );
  if (unknown.length > 0) {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.QUESTION_VERSION_MISMATCH,
      'One or more option codes are not on this questionnaire version.',
      unknown.map((option_code) => ({
        question_key: question.key,
        option_code,
      })),
    );
  }
  if (
    question.key === 'product_interests' &&
    optionCodes.includes('recommend_for_me') &&
    optionCodes.length > 1
  ) {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.EXCLUSIVE_OPTION,
      'recommend_for_me cannot be combined with other product types.',
      [{ question_key: question.key }],
    );
  }
  const count = optionCodes.length;
  if (question.selectionMode === 'single' && count !== 1) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'Choose one option.',
      [{ question_key: question.key }],
    );
  }
  const min = question.minSelections ?? (question.selectionMode === 'multi' ? 1 : 1);
  const max = question.maxSelections;
  if (count < min || (max !== null && count > max)) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      'The number of selected options is outside the allowed range.',
      [{ question_key: question.key, min, max }],
    );
  }
}
