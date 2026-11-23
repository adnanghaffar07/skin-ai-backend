import { Body, Controller, Get, Injectable, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DatabaseService } from '../database/database.service.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';

export class CartItemDto {
  @ApiProperty() @IsUUID() product_id!: string;
  @ApiProperty({ minimum: 1, maximum: 20 }) @IsInt() @Min(1) @Max(20) quantity!: number;
}

export class SavedListsDto {
  @ApiProperty({ type: [String], description: 'Product ids, newest first.' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  wishlist!: string[];

  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cart!: CartItemDto[];
}

export class SavedListsResponseDto extends SavedListsDto {
  @ApiProperty({ type: String, nullable: true }) updated_at!: string | null;
}

/** Keeps each product once (the first time it appears), so a repeated id cannot double a line. */
export function tidy(lists: SavedListsDto): SavedListsDto {
  const wishlist = [...new Set(lists.wishlist)];
  const seen = new Set<string>();
  const cart = lists.cart.filter(item => (seen.has(item.product_id) ? false : (seen.add(item.product_id), true)));
  return { wishlist, cart };
}

@Injectable()
export class SavedListsService {
  constructor(
    private readonly users: UsersService,
    private readonly database: DatabaseService,
  ) {}

  async get(user: AuthenticatedUser): Promise<SavedListsResponseDto> {
    await this.users.getMe(user);
    const rows = await this.database.query<{ wishlist: string[]; cart: CartItemDto[]; updated_at: Date }>(
      'select wishlist, cart, updated_at from public.user_saved_lists where user_id = $1',
      [user.id],
    );
    const row = rows[0];
    return { wishlist: row?.wishlist ?? [], cart: row?.cart ?? [], updated_at: row ? new Date(row.updated_at).toISOString() : null };
  }

  /** Replaces both lists with what the phone has now. */
  async save(user: AuthenticatedUser, body: SavedListsDto): Promise<SavedListsResponseDto> {
    await this.users.getMe(user);
    const lists = tidy(body);
    const rows = await this.database.query<{ updated_at: Date }>(
      `insert into public.user_saved_lists (user_id, wishlist, cart, updated_at) values ($1, $2::jsonb, $3::jsonb, now())
       on conflict (user_id) do update set wishlist = excluded.wishlist, cart = excluded.cart, updated_at = now()
       returning updated_at`,
      [user.id, JSON.stringify(lists.wishlist), JSON.stringify(lists.cart)],
    );
    return { ...lists, updated_at: new Date(rows[0].updated_at).toISOString() };
  }
}

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me/saved')
export class SavedListsController {
  constructor(private readonly lists: SavedListsService) {}

  @Get()
  @ApiOperation({ summary: 'My wishlist and cart' })
  @ApiOkResponse({ type: SavedListsResponseDto })
  get(@CurrentUser() user: AuthenticatedUser): Promise<SavedListsResponseDto> {
    return this.lists.get(user);
  }

  @Put()
  @ApiOperation({ summary: 'Replace my wishlist and cart', description: 'The phone sends both lists as they are now.' })
  @ApiOkResponse({ type: SavedListsResponseDto })
  save(@CurrentUser() user: AuthenticatedUser, @Body() body: SavedListsDto): Promise<SavedListsResponseDto> {
    return this.lists.save(user, body);
  }
}

@Module({
  imports: [UsersModule],
  controllers: [SavedListsController],
  providers: [SavedListsService],
})
export class SavedListsModule {}
