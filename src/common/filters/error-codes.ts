export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  ANSWERS_INCOMPLETE: 'ANSWERS_INCOMPLETE',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  QUESTION_VERSION_MISMATCH: 'QUESTION_VERSION_MISMATCH',
  EXCLUSIVE_OPTION: 'EXCLUSIVE_OPTION',
  MARKET_REQUIRED: 'MARKET_REQUIRED',
  AGE_RESTRICTED: 'AGE_RESTRICTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 413:
      return ErrorCode.PAYLOAD_TOO_LARGE;
    case 415:
      return ErrorCode.UNSUPPORTED_MEDIA_TYPE;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return status >= 500
        ? ErrorCode.INTERNAL_ERROR
        : ErrorCode.VALIDATION_ERROR;
  }
}
