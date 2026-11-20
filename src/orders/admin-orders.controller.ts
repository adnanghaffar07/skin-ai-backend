import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { ORDER_EMAIL_KINDS, type OrderEmailKind } from './order-emails.js';
import {
  AdminOrderDetailDto,
  AdminOrderListDto,
  AdminOrdersQueryDto,
  ChangeOrderStatusDto,
} from './dto/admin-order.dto.js';

@ApiTags('Admin: orders')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Only accounts with the admin role.' })
@UseGuards(AdminGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Orders for the team',
    description: 'Newest first. `status=paid` lists orders waiting to be bought from the store. Each item has the store link, item number and store price.',
  })
  @ApiOkResponse({ type: AdminOrderListDto })
  list(@Query() query: AdminOrdersQueryDto): Promise<AdminOrderListDto> {
    return this.orders.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One order with its items, margin and full status history' })
  @ApiOkResponse({ type: AdminOrderDetailDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminOrderDetailDto> {
    return this.orders.get(id);
  }

  @Post(':id/status')
  @ApiOperation({
    summary: 'Move an order to its next step',
    description:
      'paid -> ordered_from_store -> shipped (carrier and tracking_number required) -> delivered. Refund a paid order in Stripe first, then mark it refunded (note required). Only an unpaid order can be cancelled. The change and who made it go into the order history.',
  })
  @ApiOkResponse({ type: AdminOrderDetailDto })
  changeStatus(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ChangeOrderStatusDto,
  ): Promise<AdminOrderDetailDto> {
    return this.orders.changeStatus(admin, id, body);
  }

  @Post(':id/emails/:kind')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a customer email again',
    description: 'kind is paid, shipped, delivered or refunded, and the order must have reached that step. The order detail lists every email and whether Resend accepted it.',
  })
  @ApiOkResponse({ type: AdminOrderDetailDto })
  resendEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('kind', new ParseEnumPipe(Object.fromEntries(ORDER_EMAIL_KINDS.map((kind) => [kind, kind])))) kind: string,
  ): Promise<AdminOrderDetailDto> {
    return this.orders.resendEmail(id, kind as OrderEmailKind);
  }
}
