import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ErrorCode } from '../common/filters/error-codes.js';
import { ApiException } from '../common/http/api.exception.js';
import { DatabaseService } from '../database/database.service.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';

export const SHELF_CATEGORIES = ['cleansers', 'moisturizers', 'serums', 'sunscreens', 'exfoliants', 'other'] as const;
export type ShelfCategory = (typeof SHELF_CATEGORIES)[number];
const SHELF_LIMIT = 100;

/** Add a catalogue product (product_id), or one from elsewhere (name, brand and category). */
export class AddShelfItemDto {
  @ApiProperty({ required: false, description: 'A Clara catalogue product. Name, brand and category then come from the catalogue.' })
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiProperty({ required: false, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiProperty({ required: false, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiProperty({ required: false, enum: SHELF_CATEGORIES })
  @IsOptional()
  @IsIn(SHELF_CATEGORIES)
  category_code?: ShelfCategory;

  @ApiProperty({ required: false, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ShelfItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) product_id!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) brand!: string | null;
  @ApiProperty({ enum: SHELF_CATEGORIES }) category_code!: ShelfCategory;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Catalogue photo, when it is a catalogue product.' }) image_url!: string | null;
  @ApiProperty() created_at!: string;
}

export class ShelfDto {
  @ApiProperty({ type: [ShelfItemDto] }) items!: ShelfItemDto[];
}

type ShelfRow = { id: string; product_id: string | null; name: string; brand: string | null; category_code: ShelfCategory; note: string | null; image_url: string | null; created_at: Date };

const toDto = (row: ShelfRow): ShelfItemDto => ({ ...row, created_at: new Date(row.created_at).toISOString() });

const SELECT = `select s.id, s.product_id, s.name, s.brand, s.category_code, s.note, s.created_at,
  (select m.url from public.product_media m where m.product_id = s.product_id order by m.position limit 1) as image_url
  from public.user_shelf_items s`;

@Injectable()
export class ShelfService {
  constructor(
    private readonly users: UsersService,
    private readonly database: DatabaseService,
  ) {}

  async list(user: AuthenticatedUser): Promise<ShelfDto> {
    await this.users.getMe(user);
    const rows = await this.database.query<ShelfRow>(`${SELECT} where s.user_id = $1 order by s.created_at desc`, [user.id]);
    return { items: rows.map(toDto) };
  }

  async add(user: AuthenticatedUser, body: AddShelfItemDto): Promise<ShelfItemDto> {
    await this.users.getMe(user);
    const count = await this.database.query<{ n: number }>('select count(*)::int as n from public.user_shelf_items where user_id = $1', [user.id]);
    if (count[0].n >= SHELF_LIMIT) {
      throw new ApiException(409, ErrorCode.CONFLICT, `Your shelf holds up to ${SHELF_LIMIT} products. Remove one first.`);
    }
    let { name, brand, category_code: category } = body;
    if (body.product_id) {
      const product = (
        await this.database.query<{ name: string; brand: string | null; category: string | null }>(
          `select p.name, b.name as brand, p.category_code as category
           from public.products p
           join public.brands b on b.id = p.brand_id
           where p.id = $1 and p.deleted_at is null`,
          [body.product_id],
        )
      )[0];
      if (!product) {
        throw new ApiException(404, ErrorCode.NOT_FOUND, 'Product not found.');
      }
      name = product.name;
      brand = product.brand ?? undefined;
      category = (SHELF_CATEGORIES as readonly string[]).includes(product.category ?? '') ? (product.category as ShelfCategory) : 'other';
      // Already on the shelf: hand back the one that is there.
      const existing = await this.database.query<ShelfRow>(`${SELECT} where s.user_id = $1 and s.product_id = $2`, [user.id, body.product_id]);
      if (existing[0]) {
        return toDto(existing[0]);
      }
    }
    if (!name?.trim()) {
      throw new ApiException(400, ErrorCode.VALIDATION_ERROR, 'Give the product a name, or pick one from the catalogue.');
    }
    const inserted = await this.database.query<{ id: string }>(
      `insert into public.user_shelf_items (user_id, product_id, name, brand, category_code, note)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [user.id, body.product_id ?? null, name.trim(), brand?.trim() || null, category ?? 'other', body.note?.trim() || null],
    );
    const row = await this.database.query<ShelfRow>(`${SELECT} where s.id = $1`, [inserted[0].id]);
    return toDto(row[0]);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.database.query('delete from public.user_shelf_items where id = $2 and user_id = $1', [user.id, id]);
  }
}

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me/shelf')
export class ShelfController {
  constructor(private readonly shelf: ShelfService) {}

  @Get()
  @ApiOperation({ summary: 'My Skincare Shelf', description: 'Products I already own, newest first.' })
  @ApiOkResponse({ type: ShelfDto })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ShelfDto> {
    return this.shelf.list(user);
  }

  @Post()
  @ApiOperation({ summary: 'Add a product to my shelf', description: 'A catalogue product by id, or one from elsewhere by name, brand and category.' })
  @ApiCreatedResponse({ type: ShelfItemDto })
  add(@CurrentUser() user: AuthenticatedUser, @Body() body: AddShelfItemDto): Promise<ShelfItemDto> {
    return this.shelf.add(user, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a product from my shelf' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.shelf.remove(user, id);
  }
}

@Module({
  imports: [UsersModule],
  controllers: [ShelfController],
  providers: [ShelfService],
})
export class ShelfModule {}
