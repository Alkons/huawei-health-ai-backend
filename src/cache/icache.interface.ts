export interface ICache<T> {
  set(userId: string, key: string, value: T): Promise<void>;
  get(userId: string, key: string): Promise<T | null>;
  invalidate(userId: string, key: string): Promise<void>;
}
