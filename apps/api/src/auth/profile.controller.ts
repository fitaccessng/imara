import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from './auth.types';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto';
import { SessionGuard } from './session.guard';

@Controller()
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly auth: AuthService) {}

  @Get(['users/me', 'profile'])
  profile(@Req() req: AuthenticatedRequest) {
    return this.auth.getProfile(req.auth.userId);
  }

  @Patch(['users/me', 'profile'])
  updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.auth.userId, dto.name);
  }

  @Get('subscription')
  subscription(@Req() req: AuthenticatedRequest) {
    return this.auth.getSubscription(req.auth.userId);
  }

  @Get(['dashboard/summary', 'dashboard'])
  dashboard(@Req() req: AuthenticatedRequest) {
    return this.auth.getDashboard(req.auth.userId);
  }
}
