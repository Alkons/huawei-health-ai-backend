import { Prop } from '@nestjs/mongoose';
import type { HuaweiConsentCategory } from './huawei-consent-category.js';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';

export class HuaweiUserConsentBaseSchema extends HuaweiUserBoundSchema {
  @Prop({ type: [String], required: true, default: [] })
  requestedCategories!: HuaweiConsentCategory[];

  @Prop({ type: [String], required: true, default: [] })
  requestedScopes!: string[];
}
