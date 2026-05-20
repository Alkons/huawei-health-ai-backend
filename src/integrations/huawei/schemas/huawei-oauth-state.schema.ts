import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { HuaweiConsentCategory } from './huawei-consent-category';

export type HuaweiOAuthStateDocument = HuaweiOAuthState & Document;

@Schema({ timestamps: true })
export class HuaweiOAuthState {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  state!: string;

  @Prop({ type: [String], required: true, default: [] })
  requestedCategories!: HuaweiConsentCategory[];

  @Prop({ type: [String], required: true, default: [] })
  requestedScopes!: string[];

  @Prop({ required: true })
  clientRedirectUrl!: string;

  @Prop({ required: true })
  consentShownAt!: Date;

  @Prop({ required: true })
  consentUiVersion!: string;

  @Prop({ required: true })
  privacyPolicyVersion!: string;

  @Prop({ required: true })
  nonMedicalDisclaimerVersion!: string;

  @Prop({ required: true })
  correlationId!: string;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiOAuthStateSchema = SchemaFactory.createForClass(HuaweiOAuthState);
HuaweiOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

