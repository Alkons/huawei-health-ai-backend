import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { ICache } from './icache.interface';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

@Injectable()
export class DistributedCacheService<T> implements ICache<T>, OnModuleInit {
  private readonly logger = new Logger(DistributedCacheService.name);
  private readonly client: RedisClientType;
  private connected = false;

  constructor(private readonly configService: ConfigService) {
    const appConfig = this.configService.get<AppConfig>('app')!;
    const url = appConfig.cache.redisInternalUrl;
    this.client = createClient({ url });
    this.logger.log(`Using distributed cache: ${url}`);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;
      this.logger.log('Cache connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to cache:', error);
    }
  }

  private createUserKey(userId: string, key: string): string {
    return `${userId}_${key}`.toLowerCase();
  }

  async set(userId: string, key: string, value: T): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Cache not connected, skipping set operation');
      return;
    }
    const userKey = this.createUserKey(userId, key);
    await this.client.set(userKey, JSON.stringify(value));
  }

  async get(userId: string, key: string): Promise<T | null> {
    if (!this.connected) {
      this.logger.warn('Cache not connected, returning null');
      return null;
    }
    const userKey = this.createUserKey(userId, key);
    const result = await this.client.get(userKey);
    return result ? (JSON.parse(result) as T) : null;
  }

  async invalidate(userId: string, key: string): Promise<void> {
    if (!this.connected) {
      this.logger.warn('Cache not connected, skipping invalidate operation');
      return;
    }
    const userKey = this.createUserKey(userId, key);
    await this.client.del(userKey);
  }
}
