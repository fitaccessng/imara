import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Plan } from '@prisma/client';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { CreateCheckoutDto } from './billing.dto';
import { BachsPaymentService } from './bachs-payment.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly payments: BachsPaymentService) {}

  @Post('checkout')
  @UseGuards(SessionGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  checkout(@Req() req: AuthenticatedRequest, @Body() dto: CreateCheckoutDto) {
    const plan = dto.plan === 'PRO' ? Plan.PRO : Plan.BUSINESS;
    return this.payments.createCheckout(req.auth.userId, plan);
  }

  @Get('payments')
  @UseGuards(SessionGuard)
  listPayments(@Req() req: AuthenticatedRequest) {
    return this.payments.listPayments(req.auth.userId);
  }

  @Get('payments/:checkoutId')
  @UseGuards(SessionGuard)
  payment(@Req() req: AuthenticatedRequest, @Param('checkoutId') checkoutId: string) {
    return this.payments.getPayment(req.auth.userId, checkoutId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-bachs-signature-v2') signature: string | undefined,
  ) {
    return this.payments.handleWebhook(req.rawBody, signature);
  }
}
