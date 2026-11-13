import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  @UseGuards(SessionGuard)
  summary(@Req() request: AuthenticatedRequest) {
    return this.referrals.summary(request.auth.userId);
  }

  @Get('promotion')
  promotion() {
    return this.referrals.promotion();
  }
}
