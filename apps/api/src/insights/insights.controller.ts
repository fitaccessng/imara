import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SessionGuard } from '../auth/session.guard';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(SessionGuard)
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('weekly')
  weekly(@Req() req: AuthenticatedRequest) {
    return this.insights.weekly(req.auth.userId);
  }
}
