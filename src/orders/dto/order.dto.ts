import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const SHIPPING_OPTIONS = ['standard', 'express', 'next_day'] as const;
export type ShippingOption = (typeof SHIPPING_OPTIONS)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class OrderItemInputDto {
  @ApiProperty({ example: '4f8c1d2a-6b7e-4a91-9c0d-11e2f3a4b5c6' })
  @IsUUID()
  product_id!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemInputDto] })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  items!: OrderItemInputDto[];

  @ApiProperty({ enum: SHIPPING_OPTIONS, example: 'standard' })
  @IsIn(SHIPPING_OPTIONS)
  shipping_option!: ShippingOption;

  @ApiProperty({ example: 'US', description: 'Only US delivery for now.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^US$/, { message: 'Orders can only be delivered in the US for now.' })
  market_code!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name!: string;

  @ApiProperty({ example: 'jane@example.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '+1 555 010 0100' })
  @Transform(trim)
  @Matches(/^\+?[0-9 ()-]{7,32}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @ApiProperty({ example: '1 Main St, Apt 2, Springfield, IL 62701' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  shipping_address!: string;

  @ApiProperty({ required: false, example: 'Leave at the front desk.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  delivery_note?: string;
}

export class OrderItemDto {
  @ApiProperty() product_id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() brand!: string;
  @ApiProperty({ type: String, nullable: true }) image_url!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty({ example: '19.52' }) unit_amount!: string;
  @ApiProperty({ example: '39.04' }) line_amount!: string;
}

export class OrderDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '100001', description: 'Short number shown to the customer.' }) number!: string;
  @ApiProperty({
    enum: ['pending_payment', 'paid', 'ordered_from_store', 'shipped', 'delivered', 'cancelled', 'refunded'],
  })
  status!: string;
  @ApiProperty({ example: 'USD' }) currency_code!: string;
  @ApiProperty({ example: '39.04' }) subtotal_amount!: string;
  @ApiProperty({ enum: SHIPPING_OPTIONS }) shipping_option!: string;
  @ApiProperty({ example: '0.00' }) shipping_amount!: string;
  @ApiProperty({ example: '39.04' }) total_amount!: string;
  @ApiProperty() full_name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() shipping_address!: string;
  @ApiProperty({ type: String, nullable: true }) delivery_note!: string | null;
  @ApiProperty({ type: String, nullable: true }) carrier!: string | null;
  @ApiProperty({ type: String, nullable: true }) tracking_number!: string | null;
  @ApiProperty({ type: String, nullable: true }) paid_at!: string | null;
  @ApiProperty({ type: String, nullable: true }) ordered_from_store_at!: string | null;
  @ApiProperty({ type: String, nullable: true }) shipped_at!: string | null;
  @ApiProperty({ type: String, nullable: true }) delivered_at!: string | null;
  @ApiProperty({ type: String, nullable: true }) cancelled_at!: string | null;
  @ApiProperty() created_at!: string;
  @ApiProperty({ type: [OrderItemDto] }) items!: OrderItemDto[];
}

export class CreatedOrderDto extends OrderDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Stripe's payment page. Open it in the browser; null once the order is no longer waiting for payment.",
  })
  checkout_url!: string | null;
}

export class OrderListDto {
  @ApiProperty({ type: [OrderDto] }) items!: OrderDto[];
}

export class PaymentsConfigDto {
  @ApiProperty({ description: 'False while checkout is switched off (no payment provider configured).' })
  checkout_enabled!: boolean;
  @ApiProperty({ type: String, nullable: true, enum: ['stripe', null] }) provider!: string | null;
  @ApiProperty({
    description: 'Delivery options and their prices.',
    example: [{ id: 'standard', amount: '0.00' }, { id: 'express', amount: '6.00' }, { id: 'next_day', amount: '10.00' }],
  })
  shipping_options!: { id: string; amount: string }[];
}
