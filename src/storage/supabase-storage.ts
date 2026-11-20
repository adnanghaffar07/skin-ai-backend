import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import {
  ObjectHead,
  ObjectStorage,
  SignedUpload,
  SignedUploadRequest,
} from './object-storage.js';

/** The private bucket made by the scan_photo_storage migration. */
export const SCAN_PHOTOS_BUCKET = 'scan-photos';

/**
 * Supabase Storage, through its REST API with the project's secret key. The bucket has no policies, so nothing but
 * this key can read or write it; the phone uploads through a signed link that works for one object only.
 * Supabase signed upload links last two hours whatever is asked, so `expires_at` reports that.
 */
export class SupabaseStorage extends ObjectStorage {
  readonly provider = 'supabase';
  readonly bucket = SCAN_PHOTOS_BUCKET;
  private readonly base: string;

  constructor(
    supabaseUrl: string,
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
    this.base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1`;
  }

  async createSignedUpload(request: SignedUploadRequest): Promise<SignedUpload> {
    const response = await this.call(`/object/upload/sign/${this.bucket}/${this.path(request.key)}`, {
      method: 'POST',
    });
    const body = (await response.json()) as { url?: string };
    if (!body.url) {
      throw this.unavailable('Storage did not return an upload link.');
    }
    return {
      upload_url: `${this.base}${body.url}`,
      method: 'PUT',
      headers: { 'Content-Type': request.contentType },
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    const slash = key.lastIndexOf('/');
    const prefix = key.slice(0, slash);
    const name = key.slice(slash + 1);
    const response = await this.call(`/object/list/${this.bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, search: name, limit: 10, offset: 0 }),
    });
    const items = (await response.json()) as { name: string; metadata?: { size?: number; mimetype?: string } | null }[];
    const found = items.find(item => item.name === name);
    if (!found?.metadata) {
      return null;
    }
    return { contentType: found.metadata.mimetype ?? '', byteSize: Number(found.metadata.size ?? 0) };
  }

  async delete(key: string): Promise<void> {
    await this.call(`/object/${this.bucket}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [key] }),
    });
  }

  private path(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/');
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { apikey: this.secretKey, ...(init.headers as Record<string, string>) };
    // The older service_role key is a JWT and also goes in Authorization; the newer sb_secret_ keys go in apikey only.
    if (this.secretKey.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${this.secretKey}`;
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, { ...init, headers });
    } catch {
      throw this.unavailable('Photo storage could not be reached.');
    }
    if (!response.ok) {
      throw this.unavailable(`Photo storage answered ${response.status}.`);
    }
    return response;
  }

  private unavailable(message: string): ApiException {
    return new ApiException(503, ErrorCode.INTERNAL_ERROR, message);
  }
}
