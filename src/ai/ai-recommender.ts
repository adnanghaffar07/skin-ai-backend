import { Logger } from '@nestjs/common';
import { AiResponseError, parseAiResponse } from './ai-response.js';
import type { AiRecommendRequest, AiRecommendResponse, DroppedProduct } from './ai.types.js';

export type AiProvider = 'http' | 'stub';

export interface AiResult {
  response: AiRecommendResponse;
  dropped: DroppedProduct[];
  latencyMs: number;
}

/** Why a call to the AI service failed, as a short code for logs and the run record. */
export class AiServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

/** Something that turns a profile into product picks. Bound in AiModule to the real service, the stand-in, or nothing. */
export abstract class AiRecommender {
  abstract readonly provider: AiProvider;
  abstract recommend(request: AiRecommendRequest): Promise<AiResult>;
}

/** Calls the AI developer's service over HTTPS (docs/AI_SERVICE_CONTRACT.md). */
export class HttpAiRecommender extends AiRecommender {
  readonly provider = 'http' as const;
  private readonly logger = new Logger('AiService');

  constructor(
    private readonly baseUrl: string,
    private readonly key: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  async recommend(request: AiRecommendRequest): Promise<AiResult> {
    const started = Date.now();
    let response = await this.send(request);
    // One retry, only when a retry can help: the connection failed quickly, or the service was briefly unavailable
    // (503/504). A 502 means it found no products and a 500 that it is not set up, so Clara's own picks are used
    // straight away instead of making the person wait twice. The same request_id lets the service answer it once.
    const failedFast = response === null && Date.now() - started < 5000;
    if (failedFast || response?.status === 503 || response?.status === 504) {
      response = await this.send(request);
    }
    if (response === null) {
      throw new AiServiceError('AI_UNREACHABLE', 'The AI service did not answer in time.');
    }
    if (!response.ok) {
      throw new AiServiceError(`AI_HTTP_${response.status}`, `The AI service answered ${response.status}.`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AiServiceError('AI_BAD_JSON', 'The AI service did not answer with JSON.');
    }
    try {
      const parsed = parseAiResponse(body, request.currency);
      if (parsed.dropped.length) {
        // Ids and reasons only: no profile data is logged.
        this.logger.warn(`${request.request_id}: dropped ${parsed.dropped.length} product(s): ${JSON.stringify(parsed.dropped)}`);
      }
      return { ...parsed, latencyMs: Date.now() - started };
    } catch (error) {
      if (error instanceof AiResponseError) {
        throw new AiServiceError('AI_BAD_RESPONSE', error.message);
      }
      throw error;
    }
  }

  /** The response, or null when the service could not be reached or timed out. */
  private async send(request: AiRecommendRequest): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/v1/recommendations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Request-Id': request.request_id,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
        redirect: 'error',
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
