import { Module } from '@nestjs/common';

import { ActionBundlesController } from './action-bundles.controller';
import { ActionBundlesService } from './action-bundles.service';

@Module({
  controllers: [ActionBundlesController],
  providers: [ActionBundlesService],
  exports: [ActionBundlesService],
})
export class ActionBundlesModule {}
