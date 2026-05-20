import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';

export type HuaweiHeartSignalDocument = HuaweiHeartSignal & Document;

@Schema({ timestamps: true })
export class HuaweiHeartSignal extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  timestamp!: Date;

  @Prop({ required: true })
  heartRate!: number; // bpm

  @Prop({ required: false })
  restingHeartRate?: number; // bpm

  @Prop({ required: false })
  hrv?: number; // ms

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiHeartSignalSchema =
  SchemaFactory.createForClass(HuaweiHeartSignal);
HuaweiHeartSignalSchema.index({ userId: 1, timestamp: 1 }, { unique: true });
