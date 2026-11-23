import { Injectable } from '@nestjs/common';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { ObjectStorage } from './object-storage.js';

/** Used until a storage provider is configured. Every call answers 503 instead of pretending to work. */
@Injectable()
export class UnconfiguredStorage extends ObjectStorage {
  readonly provider = 'unconfigured';
  readonly bucket = 'unconfigured';

  createSignedUpload(): never {
    return this.fail();
  }

  head(): never {
    return this.fail();
  }

  delete(): never {
    return this.fail();
  }

  createSignedDownload(): never {
    return this.fail();
  }

  private fail(): never {
    throw new ApiException(
      503,
      ErrorCode.INTERNAL_ERROR,
      'Photo storage is not configured.',
    );
  }
}
