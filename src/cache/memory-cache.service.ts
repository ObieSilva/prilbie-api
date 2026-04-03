import { Injectable } from '@nestjs/common';
import { ICacheService } from './cache.interface';

@Injectable()
export class MemoryCacheService implements ICacheService {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value as T);
  }

  set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  delPattern(pattern: string): Promise<void> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const k of this.store.keys()) {
      if (regex.test(k)) this.store.delete(k);
    }
    return Promise.resolve();
  }
}
