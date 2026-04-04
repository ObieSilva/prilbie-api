import { Module } from '@nestjs/common';

import { MomentumController } from './momentum.controller';
import { MomentumService } from './momentum.service';

@Module({
  controllers: [MomentumController],
  providers: [MomentumService],
  exports: [MomentumService],
})
export class MomentumModule {}
