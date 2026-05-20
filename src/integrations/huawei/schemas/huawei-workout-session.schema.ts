import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';

export type HuaweiWorkoutSessionDocument = HuaweiWorkoutSession & Document;

@Schema({ timestamps: true })
export class HuaweiWorkoutSession extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  workoutId!: string;

  @Prop({ required: true })
  activityType!: string;

  @Prop({ required: true, index: true })
  startTime!: Date;

  @Prop({ required: true })
  endTime!: Date;

  @Prop({ required: true })
  duration!: number; // seconds

  @Prop({ required: true, default: 0 })
  calories!: number; // kcal

  @Prop({ required: false })
  distance?: number; // meters

  @Prop({ required: false })
  avgHeartRate?: number; // bpm

  @Prop({ required: false })
  maxHeartRate?: number; // bpm

  @Prop({ type: Object, required: true })
  rawPayload!: Record<string, any>;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiWorkoutSessionSchema =
  SchemaFactory.createForClass(HuaweiWorkoutSession);
HuaweiWorkoutSessionSchema.index({ userId: 1, workoutId: 1 }, { unique: true });
