import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { DatabaseService } from '../database/database.service.js';
import { ProductImageStorage } from '../storage/object-storage.js';
import { UsersModule } from '../users/users.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
import { ProductImagesController, ProductImagesService } from './product-images.js';

@Module({
  imports: [UsersModule],
  controllers: [CatalogController, ProductImagesController],
  providers: [
    CatalogRepository,
    CatalogService,
    AdminGuard,
    {
      provide: ProductImagesService,
      inject: [DatabaseService, ProductImageStorage],
      useFactory: (database: DatabaseService, storage: ProductImageStorage | null) => new ProductImagesService(database, storage),
    },
  ],
  exports: [CatalogRepository, ProductImagesService],
})
export class CatalogModule {}
