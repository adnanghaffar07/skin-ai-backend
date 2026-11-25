import { Logger } from '@nestjs/common';
import { AiResponseError, parseAiResponse } from './ai-response.js';
import { randomUUID } from 'node:crypto';
import type { AiProductCheck, AiRecommendRequest, AiRecommendResponse, DroppedProduct } from './ai.types.js';

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
  /** Live price and stock for products it returned earlier; null when this recommender cannot check. */
  checkProducts(_externalIds: string[], _market: string): Promise<AiProductCheck[] | null> {
    return Promise.resolve(null);
  }
}

/** The product-check answer, kept to well-formed items. Unknown statuses count as not found. */
export function parseProductChecks(body: unknown): AiProductCheck[] {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    throw new AiServiceError('AI_BAD_RESPONSE', 'The product check had no items.');
  }
  return items.flatMap((raw): AiProductCheck[] => {
    const item = raw as Record<string, unknown>;
    if (typeof item?.external_id !== 'string' || !item.external_id) {
      return [];
    }
    const price = item.price as { amount?: unknown; currency?: unknown } | null | undefined;
    const amount = typeof price?.amount === 'string' && /^\d+(\.\d{1,2})?$/.test(price.amount) ? price.amount : null;
    const currency = typeof price?.currency === 'string' ? price.currency.toUpperCase() : null;
    const said = item.status === 'ok' || item.status === 'out_of_stock' ? item.status : 'not_found';
    // A product the store says is fine but without a usable price cannot be charged.
    const status = said === 'ok' && !(amount && currency) ? 'not_found' : said;
    return [
      {
        external_id: item.external_id,
        status,
        price: amount && currency ? { amount, currency } : null,
        in_stock: status === 'ok' && item.in_stock !== false,
        url: typeof item.url === 'string' && item.url.startsWith('https://') ? item.url : null,
      },
    ];
  });
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

  /** POST /v1/product-check (contract 1.1): live price and stock, at most 50 ids per call, never cached by the service. */
  async checkProducts(externalIds: string[], market: string): Promise<AiProductCheck[]> {
    const results: AiProductCheck[] = [];
    for (let start = 0; start < externalIds.length; start += 50) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/v1/product-check`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ request_id: randomUUID(), market, external_ids: externalIds.slice(start, start + 50) }),
          signal: AbortSignal.timeout(Math.min(this.timeoutMs, 15000)),
          redirect: 'error',
        });
      } catch {
        throw new AiServiceError('AI_UNREACHABLE', 'The product check did not answer in time.');
      }
      if (!response.ok) {
        throw new AiServiceError(`AI_HTTP_${response.status}`, `The product check answered ${response.status}.`);
      }
      results.push(...parseProductChecks(await response.json().catch(() => null)));
    }
    return results;
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
