import { Module } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  controllers: [InsightsController],
  providers: [InsightsService, SessionGuard],
})
export class InsightsModule {}
