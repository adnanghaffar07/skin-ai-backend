import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard.js';
import { UsersModule } from '../users/users.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';

@Module({
  imports: [UsersModule],
  controllers: [CatalogController],
  providers: [
    CatalogRepository,
    CatalogService,
    AdminGuard,
  ],
  exports: [CatalogRepository],
})
export class CatalogModule {}
