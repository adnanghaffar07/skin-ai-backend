import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { ScansController } from './scans.controller.js';
import { ScansRepository } from './scans.repository.js';
import { ScansService } from './scans.service.js';

@Module({
  imports: [UsersModule],
  controllers: [ScansController],
  providers: [ScansRepository, ScansService],
})
export class ScansModule {}
