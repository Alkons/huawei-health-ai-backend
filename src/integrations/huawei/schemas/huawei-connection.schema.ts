import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { HuaweiConsentCategory } from './huawei-consent-category';

export type HuaweiConnectionDocument = HuaweiConnection & Document;

export type HuaweiConnectionStatus = 'connected' | 'errored' | 'disconnected';

export type HuaweiDataFreshnessStatus = 'fresh' | 'stale' | 'unknown';

@Schema({ timestamps: true })
export class HuaweiConnection {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
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

  @Prop({ type: [String], required: true, default: [] })
  enabledCategories!: HuaweiConsentCategory[];

  @Prop({ required: false })
  lastSyncAt?: Date;

  @Prop({ required: false })
  dataFreshnessStatus?: HuaweiDataFreshnessStatus;

  @Prop({ required: false })
  dataFreshnessMessage?: string;

  @Prop({ required: false })
  providerRevokedAt?: Date;

  @Prop({ required: false })
  providerRevocationReason?: 'tokenInvalid' | 'scopeReduced' | 'unknown';

  @Prop({ type: Types.ObjectId, required: false, index: true })
  tokenRefId?: Types.ObjectId;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiConnectionSchema =
  SchemaFactory.createForClass(HuaweiConnection);
