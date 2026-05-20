import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { HuaweiConsentCategory } from './huawei-consent-category';

export type HuaweiConsentLedgerEventDocument = HuaweiConsentLedgerEvent & Document;

export type HuaweiConsentLedgerEventType =
  | 'consent_shown'
  | 'consent_accepted'
  | 'consent_denied'
  | 'disconnect';

@Schema({ timestamps: true })
export class HuaweiConsentLedgerEvent {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  provider!: 'huawei';

  @Prop({ required: true })
  eventType!: HuaweiConsentLedgerEventType;

  @Prop({ required: true })
  occurredAt!: Date;

  @Prop({ type: [String], required: true, default: [] })
  requestedCategories!: HuaweiConsentCategory[];

  @Prop({ type: [String], required: true, default: [] })
  requestedScopes!: string[];

  @Prop({ type: [String], required: false })
  grantedCategories?: HuaweiConsentCategory[];

  @Prop({ type: [String], required: false })
  grantedScopes?: string[];

  @Prop({ required: true })
  consentUiVersion!: string;

  @Prop({ required: true })
  privacyPolicyVersion!: string;

  @Prop({ required: true })
  nonMedicalDisclaimerVersion!: string;

  @Prop({ required: true, index: true })
  correlationId!: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiConsentLedgerEventSchema = SchemaFactory.createForClass(
  HuaweiConsentLedgerEvent,
);
HuaweiConsentLedgerEventSchema.index({ userId: 1, occurredAt: -1 });

