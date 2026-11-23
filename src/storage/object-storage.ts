export interface SignedUpload {
  upload_url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_at: string;
}

export interface ObjectHead {
  contentType: string;
  byteSize: number;
}

export interface SignedUploadRequest {
  key: string;
  contentType: string;
  byteSize: number;
  expiresInSeconds: number;
}

/**
 * Private object storage for face photos. The rest of the API only talks to this
 * interface, so the provider (Cloudflare R2 or Supabase Storage) can be chosen later
 * by adding one implementation and binding it in StorageModule.
 */
export abstract class ObjectStorage {
  abstract readonly provider: string;
  abstract readonly bucket: string;
  abstract createSignedUpload(request: SignedUploadRequest): Promise<SignedUpload>;
  abstract head(key: string): Promise<ObjectHead | null>;
  abstract delete(key: string): Promise<void>;
  /** A link that shows the object for `expiresInSeconds`, for pictures the person may see (a profile photo). */
  abstract createSignedDownload(key: string, expiresInSeconds: number): Promise<string>;
}

/** The private user-media bucket: profile photos and other pictures people add. Same provider as ObjectStorage. */
export abstract class MediaStorage extends ObjectStorage {}
