import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { SessionDocument } from './schemas/session.schema';
import { Session } from './schemas/session.schema';
import type { ICache } from '../cache/icache.interface';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
    @Inject('CACHE_SERVICE') private readonly cache: ICache<Session>,
  ) {}

  /**
   * Create a new session. Like adding a new pipe connection to the main tank!
   */
  async create(
    userId: string,
    refreshToken: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<SessionDocument> {
    const session = await this.sessionModel.create({
      userId: new Types.ObjectId(userId),
      refreshToken,
      expiresAt,
      userAgent,
      ipAddress,
    });

    await this.cache.set(
      userId,
      `session_${String(session._id)}`,
      session.toObject() as Session,
    );
    return session;
  }

  /**
   * Find session by ID with cache-aside.
   */
  async findById(userId: string, sessionId: string): Promise<Session | null> {
    const cacheKey = `session_${sessionId}`;
    const cached = await this.cache.get(userId, cacheKey);
    if (cached) {
      return cached;
    }

    const session = await this.sessionModel.findById(sessionId).lean();
    if (session) {
      await this.cache.set(userId, cacheKey, session as Session);
    }

    return session as Session | null;
  }

  /**
   * Revoke a specific session.
   */
  async revoke(userId: string, sessionId: string): Promise<void> {
    await this.sessionModel.findByIdAndDelete(sessionId);
    await this.cache.invalidate(userId, `session_${sessionId}`);
  }

  /**
   * Revoke all sessions for a user. Like shutting off all valves for a whole building!
   */
  async revokeAll(userId: string): Promise<void> {
    const sessions = await this.sessionModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id')
      .lean();

    await this.sessionModel.deleteMany({ userId: new Types.ObjectId(userId) });

    for (const session of sessions) {
      await this.cache.invalidate(userId, `session_${String(session._id)}`);
    }
  }

  /**
   * Find session by refresh token. Strong like a backup generator!
   */
  async findByRefreshToken(refreshToken: string): Promise<Session | null> {
    return this.sessionModel.findOne({ refreshToken }).lean();
  }

  /**
   * Find all sessions for a user. Like a layout of all pipes in the basement!
   */
  async findAllByUser(userId: string): Promise<Session[]> {
    return this.sessionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}
