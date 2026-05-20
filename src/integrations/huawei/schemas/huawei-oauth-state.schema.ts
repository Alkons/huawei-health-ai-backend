import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiConsentMetadataSchema } from './huawei-consent-metadata.schema.js';
import { HuaweiUserConsentBaseSchema } from './huawei-user-consent-base.schema.js';

export type HuaweiOAuthStateDocument = HuaweiOAuthState & Document;

@Schema({ timestamps: true })
export class HuaweiOAuthState
  extends HuaweiUserConsentBaseSchema
  implements HuaweiConsentMetadataSchema
{
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  state!: string;

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

  correlationId!: string;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiOAuthStateSchema =
  SchemaFactory.createForClass(HuaweiOAuthState);
HuaweiOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
