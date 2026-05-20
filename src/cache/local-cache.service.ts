import { Injectable } from '@nestjs/common';
import { ICache } from './icache.interface';

@Injectable()
export class LocalCacheService<T> implements ICache<T> {
  private readonly localValues = new Map<string, T>();

  private createUserKey(userId: string, key: string): string {
    return `${userId}_${key}`.toLowerCase();
  }

  set(userId: string, key: string, value: T): Promise<void> {
    const userKey = this.createUserKey(userId, key);
    this.localValues.set(userKey, value);
    return Promise.resolve();
  }

  get(userId: string, key: string): Promise<T | null> {
    const userKey = this.createUserKey(userId, key);
    const result = this.localValues.get(userKey);
    return Promise.resolve(result ?? null);
  }

  invalidate(userId: string, key: string): Promise<void> {
    const userKey = this.createUserKey(userId, key);
    this.localValues.delete(userKey);
    return Promise.resolve();
  }
}
