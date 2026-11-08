import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailerService } from './mailer.service';
import { SessionGuard } from './session.guard';
import { ProfileController } from './profile.controller';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';

@Module({
  imports: [PlanCatalogueModule],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, MailerService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
