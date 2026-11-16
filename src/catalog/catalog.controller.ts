import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CatalogService } from './catalog.service.js';
import {
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListDto,
} from './dto/product.dto.js';

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller('products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Search and list products for a market',
    description:
      'Only active products available in the market. Keyset pagination: pass next_cursor as cursor.',
  })
  @ApiOkResponse({ type: ProductListDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductListDto> {
    return this.catalog.list(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Product detail',
    description:
      'Price, ingredients, how to use and cautions. No cart or checkout fields.',
  })
  @ApiQuery({ name: 'market', required: false, example: 'US' })
  @ApiOkResponse({ type: ProductDetailDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('market') market?: string,
  ): Promise<ProductDetailDto> {
    return this.catalog.get(user, id, market?.toUpperCase());
  }
}
