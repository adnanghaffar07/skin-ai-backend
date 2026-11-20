import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from '../auth/admin.guard.js';
import { UsersModule } from '../users/users.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { OrderEmailsService } from './order-emails.js';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService, STRIPE_CLIENT } from './orders.service.js';
import { PaymentsController } from './payments.controller.js';
import { StripeClient } from './stripe.js';

@Module({
  imports: [UsersModule],
  controllers: [OrdersController, PaymentsController, AdminOrdersController],
  providers: [
    OrdersRepository,
    OrdersService,
    AdminOrdersService,
    OrderEmailsService,
    AdminGuard,
    {
      // No Stripe client while payments are off: checkout reports itself unavailable.
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const key = config.get<string>('STRIPE_SECRET_KEY');
        return config.get<string>('PAYMENTS_MODE') === 'stripe' && key ? new StripeClient(key) : null;
      },
    },
  ],
})
export class OrdersModule {}
