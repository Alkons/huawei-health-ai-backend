import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SessionDocument = Session & Document;

/**
 * Session storage in MongoDB. Like a logbook for all pipes in the building!
 */
@Schema({ timestamps: true })
export class Session {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  refreshToken!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  userAgent?: string;

  @Prop()
  ipAddress?: string;

  createdAt!: Date;

  updatedAt!: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// Add TTL index to automatically remove expired sessions
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
