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
/** The private bucket made by the user_media migration (profile photos). */
export const USER_MEDIA_BUCKET = 'user-media';

/** Where the secret key comes from: a fixed value (SUPABASE_SECRET_KEY), or a lookup such as Supabase Vault. */
export type SecretKeySource = string | (() => Promise<string | null>);

/** After a lookup finds no key, wait this long before asking again. */
const MISSING_KEY_RETRY_MS = 60_000;

/**
 * Supabase Storage, through its REST API with the project's secret key. The bucket has no policies, so nothing but
 * this key can read or write it; the phone uploads through a signed link that works for one object only.
 * Supabase signed upload links last two hours whatever is asked, so `expires_at` reports that.
 */
export class SupabaseStorage extends ObjectStorage {
  readonly provider = 'supabase';
  private readonly base: string;
  private key: string | null = null;
  private missingUntil = 0;

  constructor(
    supabaseUrl: string,
    private readonly keySource: SecretKeySource,
    private readonly fetchImpl: typeof fetch = fetch,
    readonly bucket: string = SCAN_PHOTOS_BUCKET,
  ) {
    super();
    this.base = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1`;
  }

  /** The key, looked up once and then kept. Without one, photo calls answer 503 as before storage was set up. */
  private async secretKey(): Promise<string> {
    if (this.key) {
      return this.key;
    }
    if (typeof this.keySource === 'string') {
      this.key = this.keySource;
      return this.key;
    }
    if (Date.now() >= this.missingUntil) {
      let found: string | null = null;
      try {
        found = await this.keySource();
      } catch {
        found = null;
      }
      if (found && /^(sb_secret_|eyJ)/.test(found.trim())) {
        this.key = found.trim();
        return this.key;
      }
      this.missingUntil = Date.now() + MISSING_KEY_RETRY_MS;
    }
    throw this.unavailable('Photo storage is not configured.');
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

  async createSignedDownload(key: string, expiresInSeconds: number): Promise<string> {
    const response = await this.call(`/object/sign/${this.bucket}/${this.path(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    const body = (await response.json()) as { signedURL?: string };
    if (!body.signedURL) {
      throw this.unavailable('Storage did not return a link.');
    }
    return `${this.base}${body.signedURL}`;
  }

  private path(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/');
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const key = await this.secretKey();
    const headers: Record<string, string> = { apikey: key, ...(init.headers as Record<string, string>) };
    // The older service_role key is a JWT and also goes in Authorization; the newer sb_secret_ keys go in apikey only.
    if (key.startsWith('eyJ')) {
      headers.Authorization = `Bearer ${key}`;
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, { ...init, headers });
    } catch {
      throw this.unavailable('Photo storage could not be reached.');
    }
    if ((response.status === 401 || response.status === 403) && typeof this.keySource !== 'string') {
      // A key from Vault that storage refuses was probably replaced there: look it up again next time.
      this.key = null;
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
