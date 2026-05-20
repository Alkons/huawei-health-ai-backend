import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';
import type { HuaweiConsentCategory } from './huawei-consent-category.js';

export type HuaweiSyncProgressDocument = HuaweiSyncProgress & Document;

export type HuaweiSyncProgressStatus =
  | 'synced'
  | 'syncing'
  | 'failed'
  | 'pending';

export type HuaweiSyncReasonClass =
  | 'permissionNotGranted'
  | 'deviceUnsupported'
  | 'regionLimitation'
  | 'syncSettingsOff'
  | 'noDataForRange'
  | 'ok'
  | 'notYetSynced';

@Schema({ timestamps: true })
export class HuaweiSyncProgress extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true, type: String })
  category!: HuaweiConsentCategory;

  @Prop({ required: true, default: 'pending', type: String })
  status!: HuaweiSyncProgressStatus;

  @Prop({ required: false })
  lastSuccessAt?: Date;

  @Prop({ required: false })
  lastAttemptedAt?: Date;

  @Prop({ required: true, default: 'notYetSynced', type: String })
  reasonClass!: HuaweiSyncReasonClass;

  @Prop({ required: false })
  explanation?: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiSyncProgressSchema =
  SchemaFactory.createForClass(HuaweiSyncProgress);
HuaweiSyncProgressSchema.index({ userId: 1, category: 1 }, { unique: true });
