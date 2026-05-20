import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HuaweiProviderTokenDocument = HuaweiProviderToken & Document;

@Schema({ timestamps: true })
export class HuaweiProviderToken {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  provider!: 'huawei';

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

export const HuaweiProviderTokenSchema = SchemaFactory.createForClass(HuaweiProviderToken);
HuaweiProviderTokenSchema.index({ userId: 1, provider: 1 }, { unique: true });

