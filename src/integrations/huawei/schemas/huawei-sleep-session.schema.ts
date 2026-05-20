import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';

export type HuaweiSleepSessionDocument = HuaweiSleepSession & Document;

@Schema({ timestamps: true })
export class HuaweiSleepSession extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  sleepId!: string;

  @Prop({ required: true, index: true })
  startTime!: Date;

  @Prop({ required: true })
  endTime!: Date;

  @Prop({ required: true })
  duration!: number; // minutes

  @Prop({ required: false })
  deepSleepDuration?: number; // minutes

  @Prop({ required: false })
  lightSleepDuration?: number; // minutes

  @Prop({ required: false })
  remSleepDuration?: number; // minutes

  @Prop({ required: false })
  awakeDuration?: number; // minutes

  @Prop({ type: Object, required: true })
  rawPayload!: Record<string, any>;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiSleepSessionSchema =
  SchemaFactory.createForClass(HuaweiSleepSession);
HuaweiSleepSessionSchema.index({ userId: 1, sleepId: 1 }, { unique: true });
