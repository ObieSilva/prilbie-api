import { Module } from '@nestjs/common';

import { MomentumModule } from '../momentum/momentum.module';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';

@Module({
  imports: [MomentumModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
