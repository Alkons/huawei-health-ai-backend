import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HuaweiUserBoundSchema } from './huawei-user-bound.schema.js';

export type HuaweiProviderTokenDocument = HuaweiProviderToken & Document;

@Schema({ timestamps: true })
export class HuaweiProviderToken extends HuaweiUserBoundSchema {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  accessToken!: string;

  @Prop({ required: true })
  accessTokenExpiresAt!: Date;

  @Prop({ required: true })
  refreshTokenEncrypted!: string;

  @Prop({ required: true })
  scope!: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const HuaweiProviderTokenSchema =
  SchemaFactory.createForClass(HuaweiProviderToken);
HuaweiProviderTokenSchema.index({ userId: 1, provider: 1 }, { unique: true });
