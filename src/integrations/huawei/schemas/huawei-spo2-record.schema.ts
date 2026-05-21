import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';

export type HuaweiSpO2RecordDocument = HuaweiSpO2Record & Document;

@Schema({ timestamps: true })
export class HuaweiSpO2Record extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  timestamp!: Date;

  @Prop({ required: true })
  spo2!: number; // percentage

  @Prop({ required: false, default: false })
  isLowSpO2?: boolean;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiSpO2RecordSchema =
  SchemaFactory.createForClass(HuaweiSpO2Record);
HuaweiSpO2RecordSchema.index({ userId: 1, timestamp: 1 }, { unique: true });
