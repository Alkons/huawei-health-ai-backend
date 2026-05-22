import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CoachingFeedbackDocument = CoachingFeedback & Document;

@Schema({ timestamps: true })
export class CoachingFeedback {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  date!: string; // YYYY-MM-DD representing the day of feedback

  @Prop({ required: true })
  summary!: string;

  @Prop({ type: [String], required: true, default: [] })
  positiveSignals!: string[];

  @Prop({ type: [String], required: true, default: [] })
  concerns!: string[];

  @Prop({ type: [String], required: true, default: [] })
  nextActions!: string[];

  @Prop({ type: [String], required: true, default: [] })
  followUpQuestions!: string[];

  @Prop({ required: true, enum: ['high', 'medium', 'low'] })
  confidenceLevel!: 'high' | 'medium' | 'low';

  @Prop({ required: true, default: false })
  hasSafetyAlert!: boolean;

  @Prop({ required: true })
  disclaimer!: string;

  @Prop({ required: true })
  dataWindowStart!: Date;

  @Prop({ required: true })
  dataWindowEnd!: Date;

  @Prop({ required: true, default: Date.now })
  generatedAt!: Date;
}

export const CoachingFeedbackSchema =
  SchemaFactory.createForClass(CoachingFeedback);
CoachingFeedbackSchema.index({ userId: 1, date: 1 }, { unique: true });
