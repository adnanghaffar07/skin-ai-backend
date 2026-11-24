import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { codeForStatus } from './error-codes.js';

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details: unknown[];
  requestId: string;
}

/** Told about failures so they can be alerted on (AlertsService); optional so tests can make the filter alone. */
export interface FailureListener {
  serverError(info: { method: string; path: string; status: number; requestId: string; message: string }): Promise<void>;
  authFailure(): Promise<void>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly listener?: FailureListener) {}

  /**
   * Answers with the error body. A server error or a refused token is first handed to the alert listener, and the answer
   * waits for it (at most ALERT_WAIT_MS): on Vercel a function can be stopped as soon as it answers, which would drop the
   * alert email.
   */
  catch(exception: unknown, host: ArgumentsHost): void | Promise<void> {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = readRequestId(request);

    const body = toErrorBody(exception, requestId);
    let alert: Promise<void> | undefined;
    if (body.statusCode >= 500) {
      const message = exception instanceof Error ? exception.message : 'unknown error';
      // Method, path without query, request id and message only. No body, headers or token.
      this.logger.error(`${request.method} ${request.path} ${body.statusCode} ${requestId}: ${message}`);
      alert = this.listener?.serverError({ method: request.method, path: request.path, status: body.statusCode, requestId, message });
    } else if (body.statusCode === 401) {
      alert = this.listener?.authFailure();
    }
    const answer = () => {
      response.status(body.statusCode).json(body);
    };
    if (!alert) {
      answer();
      return;
    }
    return withTimeout(alert, ALERT_WAIT_MS).then(answer, answer);
  }
}

/** The longest an error answer waits for its alert to be recorded and emailed. */
export const ALERT_WAIT_MS = 3_000;

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([work.catch(() => undefined), timeout]).finally(() => clearTimeout(timer));
}

function readRequestId(request: Request): string {
  const header = request.header('x-request-id');
  if (header && /^[\w.-]{1,80}$/.test(header)) {
    return header;
  }
  return randomUUID();
}

function toErrorBody(exception: unknown, requestId: string): ApiErrorBody {
  if (exception instanceof HttpException) {
    return fromHttpException(exception, requestId);
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: codeForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
    message: 'An unexpected error occurred.',
    details: [],
    requestId,
  };
}

function fromHttpException(
  exception: HttpException,
  requestId: string,
): ApiErrorBody {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  let code: string = codeForStatus(statusCode);
  let message = exception.message;
  let details: unknown[] = [];

  if (typeof response === 'string') {
    message = response;
  } else if (isRecord(response)) {
    if (typeof response.code === 'string') {
      code = response.code;
    }
    if (Array.isArray(response.message)) {
      code = codeForStatus(HttpStatus.BAD_REQUEST);
      message = 'Validation failed.';
      details = response.message;
    } else if (typeof response.message === 'string') {
      message = response.message;
    }
    if (Array.isArray(response.details)) {
      details = response.details;
    }
  }

  return { statusCode, code, message, details, requestId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
