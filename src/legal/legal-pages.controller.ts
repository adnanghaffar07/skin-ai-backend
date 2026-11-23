import { Controller, Get, Module, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { legalPage, PRIVACY, TERMS } from './legal-pages.js';

/** The plain address out of "Clara Team <team@example.com>" or "team@example.com"; undefined when there is none. */
export function contactAddress(replyTo: string | undefined): string | undefined {
  const match = replyTo?.match(/<([^<>\s@]+@[^<>\s@]+)>|^\s*([^<>\s@]+@[^<>\s@]+)\s*$/);
  return match ? match[1] ?? match[2] : undefined;
}

/** The privacy policy and terms of service, public pages the app and the store listings link to. */
@ApiExcludeController()
@Controller('legal')
export class LegalPagesController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('privacy')
  privacy(@Res() response: Response): void {
    this.send(response, legalPage('Privacy Policy', PRIVACY, this.contact()));
  }

  @Public()
  @Get('terms')
  terms(@Res() response: Response): void {
    this.send(response, legalPage('Terms of Service', TERMS, this.contact()));
  }

  private contact(): string | undefined {
    return contactAddress(this.config.get<string>('EMAIL_REPLY_TO'));
  }

  private send(response: Response, html: string): void {
    // No scripts at all; the pages may be cached briefly by browsers and the stores' review tools.
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader('Cache-Control', 'public, max-age=300');
    response.status(200).type('html').send(html);
  }
}

@Module({ controllers: [LegalPagesController] })
export class LegalPagesModule {}
