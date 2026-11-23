import { Module } from '@nestjs/common';
import { AvatarService } from './avatar.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, AvatarService],
  exports: [UsersService, AvatarService],
})
export class UsersModule {}
