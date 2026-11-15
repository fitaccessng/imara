import { forwardRef, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailerService } from './mailer.service';
import { SessionGuard } from './session.guard';
import { ProfileController } from './profile.controller';
import { PlanCatalogueModule } from '../subscriptions/plan-catalogue.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [PlanCatalogueModule, forwardRef(() => WorkspacesModule)],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, MailerService, SessionGuard],
  exports: [AuthService, MailerService, SessionGuard],
})
export class AuthModule {}
