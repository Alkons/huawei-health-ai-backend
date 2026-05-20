import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { HuaweiConsentCategory } from './huawei-consent-category';
import { HuaweiConsentMetadataSchema } from './huawei-consent-metadata.schema.js';
import { HuaweiUserConsentBaseSchema } from './huawei-user-consent-base.schema.js';

export type HuaweiConsentLedgerEventDocument = HuaweiConsentLedgerEvent &
  Document;

export type HuaweiConsentLedgerEventType =
  | 'consent_shown'
  | 'consent_accepted'
  | 'consent_denied'
  | 'disconnect';

@Schema({ timestamps: true })
export class HuaweiConsentLedgerEvent
  extends HuaweiUserConsentBaseSchema
  implements HuaweiConsentMetadataSchema
{
  _id!: Types.ObjectId;

  @Prop({ required: true })
  eventType!: HuaweiConsentLedgerEventType;

  @Prop({ required: true })
  occurredAt!: Date;

  @Prop({ type: [String], required: false })
  grantedCategories?: HuaweiConsentCategory[];

  @Prop({ type: [String], required: false })
  grantedScopes?: string[];

  consentUiVersion!: string;

  privacyPolicyVersion!: string;

  nonMedicalDisclaimerVersion!: string;

  correlationId!: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiConsentLedgerEventSchema = SchemaFactory.createForClass(
  HuaweiConsentLedgerEvent,
);
HuaweiConsentLedgerEventSchema.index({ userId: 1, occurredAt: -1 });
