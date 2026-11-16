import { Global, Module } from '@nestjs/common';
import { ObjectStorage } from './object-storage.js';
import { UnconfiguredStorage } from './unconfigured-storage.js';

@Global()
@Module({
  providers: [{ provide: ObjectStorage, useClass: UnconfiguredStorage }],
  exports: [ObjectStorage],
})
export class StorageModule {}
