import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ORDER_STATUSES, type OrderStatus } from '../admin-order-rules.js';
import { OrderDto, OrderItemDto } from './order.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AdminOrdersQueryDto {
  @ApiProperty({ required: false, enum: ORDER_STATUSES, description: 'Only orders with this status, e.g. paid = waiting to be bought.' })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;

  @ApiProperty({ required: false, default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ required: false, description: 'Older than this (created_at of the last order on the previous page).' })
  @IsOptional()
  @IsISO8601()
  before?: string;
}

export class ChangeOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES, example: 'shipped' })
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;

  @ApiProperty({ required: false, example: 'USPS', description: 'Needed for shipped.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  carrier?: string;

  @ApiProperty({ required: false, example: '9400111899223197428490', description: 'Needed for shipped.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128)
  tracking_number?: string;

  @ApiProperty({ required: false, example: 'Target order 102-555', description: 'Needed for refunded and cancelled.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminOrderItemDto extends OrderItemDto {
  @ApiProperty({ type: String, nullable: true, example: 'Target' }) retailer_name!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Where to buy it.' }) retailer_url!: string | null;
  @ApiProperty({ type: String, nullable: true, description: "The store's item number (Target TCIN)." }) retailer_item_id!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '17.99', description: 'Store price per unit when the customer ordered.' })
  store_unit_amount!: string | null;
}

export class StatusEventDto {
  @ApiProperty({ type: String, nullable: true }) from_status!: string | null;
  @ApiProperty() to_status!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Team member who made the change; null for Stripe.' })
  by!: string | null;
  @ApiProperty() at!: string;
}

export class AdminOrderDto extends OrderDto {
  @ApiProperty({ type: [AdminOrderItemDto] }) declare items: AdminOrderItemDto[];
  @ApiProperty({ type: String, nullable: true, example: '28.88', description: 'What the items cost at the store (delivery from the store not included).' })
  store_cost_total!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '2.46', description: 'Items charged minus their store cost.' })
  items_margin!: string | null;
  @ApiProperty({ type: String, nullable: true }) refunded_at!: string | null;
  @ApiProperty({ type: [String], enum: ORDER_STATUSES, description: 'What the team can change the status to next.' })
  next_statuses!: string[];
}

export class OrderEmailDto {
  @ApiProperty({ enum: ['paid', 'shipped', 'delivered', 'refunded'] }) kind!: string;
  @ApiProperty({ enum: ['sending', 'sent', 'failed', 'skipped'], description: 'sent = accepted by Resend. skipped = email sending is off.' })
  status!: string;
  @ApiProperty() to!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Why it failed.' }) error!: string | null;
  @ApiProperty() attempts!: number;
  @ApiProperty() at!: string;
}

export class AdminOrderDetailDto extends AdminOrderDto {
  @ApiProperty({ type: [StatusEventDto] }) history!: StatusEventDto[];
  @ApiProperty({ type: [OrderEmailDto], description: 'Emails sent to the customer about this order.' }) emails!: OrderEmailDto[];
}

export class AdminOrderListDto {
  @ApiProperty({ type: [AdminOrderDto] }) items!: AdminOrderDto[];
  @ApiProperty({ type: String, nullable: true, description: 'Pass as `before` for the next page; null on the last page.' })
  next_before!: string | null;
}
