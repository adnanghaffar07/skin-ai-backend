import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CreatedOrderDto, CreateOrderDto, OrderListDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Place an order and get the payment page',
    description:
      "Prices and delivery come from Clara, not from the app. The order waits for payment; open `checkout_url` (Stripe's own page) to pay. The same Idempotency-Key returns the same order and the same payment page.",
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: CreatedOrderDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateOrderDto,
  ): Promise<CreatedOrderDto> {
    return this.orders.create(user, key, body);
  }

  @Get()
  @ApiOperation({ summary: "The signed-in person's orders, newest first" })
  @ApiOkResponse({ type: OrderListDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<OrderListDto> {
    return this.orders.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One order with its items and status', description: 'Poll this after the payment page closes.' })
  @ApiOkResponse({ type: CreatedOrderDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CreatedOrderDto> {
    return this.orders.get(user, id);
  }
}
