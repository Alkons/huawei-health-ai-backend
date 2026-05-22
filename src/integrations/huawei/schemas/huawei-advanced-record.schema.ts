import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema';

export type HuaweiAdvancedRecordDocument = HuaweiAdvancedRecord & Document;

@Schema({ timestamps: true })
export class HuaweiAdvancedRecord extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  recordType!: string; // 'sleepBreathing' | 'cardiacAlerts' | 'abpm' | 'skinTemperature' | 'vo2Max' | 'runningForm'

  @Prop({ required: true, index: true })
  timestamp!: Date;

  @Prop({ type: Object, required: true })
  data!: Record<string, any>;

  @Prop({ type: Object, required: false })
  rawPayload?: Record<string, any>;
}

export const HuaweiAdvancedRecordSchema =
  SchemaFactory.createForClass(HuaweiAdvancedRecord);

HuaweiAdvancedRecordSchema.index({ userId: 1, recordType: 1, timestamp: -1 });
