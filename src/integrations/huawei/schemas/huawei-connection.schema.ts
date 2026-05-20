import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { HuaweiConsentCategory } from './huawei-consent-category';

export type HuaweiConnectionDocument = HuaweiConnection & Document;

export type HuaweiConnectionStatus = 'connected' | 'errored' | 'disconnected';

@Schema({ timestamps: true })
export class HuaweiConnection {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  providerUserId!: string;

  @Prop({ required: true })
  status!: HuaweiConnectionStatus;

  @Prop({ required: false })
  connectedAt?: Date;

  @Prop({ required: false })
  lastErrorCode?: string;

  @Prop({ required: false })
  lastErrorAt?: Date;

  @Prop({ type: [String], required: true, default: [] })
  grantedScopes!: string[];

  @Prop({ type: [String], required: true, default: [] })
  grantedCategories!: HuaweiConsentCategory[];

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tokenRefId!: Types.ObjectId;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiConnectionSchema =
  SchemaFactory.createForClass(HuaweiConnection);
HuaweiConnectionSchema.index({ userId: 1 }, { unique: true });
