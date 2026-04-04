import { Module } from '@nestjs/common';

import { MomentumModule } from '../momentum/momentum.module';
import { AiCoachController } from './ai-coach.controller';
import { AiCoachService } from './ai-coach.service';

@Module({
  imports: [MomentumModule],
  controllers: [AiCoachController],
  providers: [AiCoachService],
})
export class AiCoachModule {}
