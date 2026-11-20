import { Controller, Get, Headers, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { PaymentsConfigDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

const RETURN_PAGE = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#FDF4F2;color:#2B1F22;margin:0;padding:48px 24px;text-align:center">
<h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="font-size:16px;line-height:1.5;margin:0">${body}</p>
</body></html>`;

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly orders: OrdersService) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Whether checkout is on, and the delivery prices' })
  @ApiOkResponse({ type: PaymentsConfigDto })
  config(): PaymentsConfigDto {
    return this.orders.paymentsConfig();
  }

  /** Stripe calls this; the signature proves it. Needs the untouched request body, so the app keeps rawBody on. */
  @Public()
  @Post('stripe/webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  stripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    return this.orders.handleStripeEvent(request.rawBody, signature);
  }

  /** Where Stripe's page sends the customer afterwards. The app checks the order itself when it comes back. */
  @Public()
  @Get('return')
  @ApiExcludeEndpoint()
  paymentReturn(@Query('result') result: string | undefined, @Res() response: Response): void {
    const paid = result === 'success';
    // The page's own inline styles only; nothing else may load.
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    response
      .status(200)
      .type('html')
      .send(
        paid
          ? RETURN_PAGE('Payment received', 'Thank you. You can go back to the Clara app to see your order.')
          : RETURN_PAGE('Payment not completed', 'No payment was taken. Go back to the Clara app to try again.'),
      );
  }
}
