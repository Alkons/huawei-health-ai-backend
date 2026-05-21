import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';

export type HuaweiDailyActivityDocument = HuaweiDailyActivity & Document;

@Schema({ timestamps: true })
export class HuaweiDailyActivity extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  date!: string; // YYYY-MM-DD

  @Prop({ required: true, default: 0 })
  steps!: number;

  @Prop({ required: true, default: 0 })
  calories!: number; // active calories, kcal

  @Prop({ required: true, default: 0 })
  distance!: number; // meters

  @Prop({ required: true, default: 0 })
  intensityMinutes!: number;

  @Prop({ required: true, default: 0 })
  hoursActive!: number;

  @Prop({ type: [Object], required: true, default: [] })
  rawPayloads!: Record<string, any>[];

  @Prop({ required: true, default: Date.now })
  lastSyncedAt!: Date;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiDailyActivitySchema =
  SchemaFactory.createForClass(HuaweiDailyActivity);
HuaweiDailyActivitySchema.index({ userId: 1, date: 1 }, { unique: true });
