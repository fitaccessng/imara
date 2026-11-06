import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailerService } from './mailer.service';
import { SessionGuard } from './session.guard';
import { ProfileController } from './profile.controller';

@Module({
  controllers: [AuthController, ProfileController],
  providers: [AuthService, MailerService, SessionGuard],
})
export class AuthModule {}
