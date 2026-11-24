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

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = readRequestId(request);

    const body = toErrorBody(exception, requestId);
    if (body.statusCode >= 500) {
      const message = exception instanceof Error ? exception.message : 'unknown error';
      // Method, path without query, request id and message only. No body, headers or token.
      this.logger.error(`${request.method} ${request.path} ${body.statusCode} ${requestId}: ${message}`);
      void this.listener?.serverError({ method: request.method, path: request.path, status: body.statusCode, requestId, message });
    } else if (body.statusCode === 401) {
      void this.listener?.authFailure();
    }
    response.status(body.statusCode).json(body);
  }
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
