import { createZodDto } from 'nestjs-zod';

import { BundleLevelsSchema } from '../../common/schemas/shared';

export class UpdateBundleDto extends createZodDto(BundleLevelsSchema) {}
