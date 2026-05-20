import { Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export class HuaweiUserBoundSchema {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  provider!: 'huawei';
}
