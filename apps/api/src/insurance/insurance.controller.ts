import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { MedicalDeclarationDto } from './dto/medical-declaration.dto.js';
import {
  type QuoteResponse,
  toQuoteResponse,
} from './dto/quote-response.dto.js';
import { QuotesService } from './quotes.service.js';

@Controller('insurance')
export class InsuranceController {
  constructor(private readonly quotes: QuotesService) {}

  /** POST /api/v1/insurance/quote — price and lock a quote for 15 minutes. */
  @Post('quote')
  @HttpCode(HttpStatus.CREATED)
  async createQuote(@Body() dto: CreateQuoteDto): Promise<QuoteResponse> {
    return toQuoteResponse(await this.quotes.createQuote(dto));
  }

  /** GET /api/v1/insurance/quote/:id — re-fetch a quote (e.g. after a page refresh). */
  @Get('quote/:id')
  async getQuote(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<QuoteResponse> {
    return toQuoteResponse(await this.quotes.getQuote(id));
  }

  /** POST /api/v1/insurance/quote/:id/medical-declaration — journey step 2. */
  @Post('quote/:id/medical-declaration')
  @HttpCode(HttpStatus.OK)
  async declare(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MedicalDeclarationDto,
  ): Promise<QuoteResponse> {
    return toQuoteResponse(await this.quotes.declareMedicalHistory(id, dto));
  }
}
