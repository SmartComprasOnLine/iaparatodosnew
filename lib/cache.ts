import { redis } from './db'

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class SimpleCache {
  private store = new Map<string, CacheEntry<any>>()

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }

    return entry.value as T
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (typeof ttlMs !== 'number' || ttlMs <= 0) {
      this.store.delete(key)
      return
    }

    if (value === undefined) {
      return
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

const globalCache = globalThis as typeof globalThis & {
  __simpleCache?: SimpleCache
}

if (!globalCache.__simpleCache) {
  globalCache.__simpleCache = new SimpleCache()
}

export const cache = globalCache.__simpleCache

export async function getOrSetCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  try {
    const cachedString = await redis.get(key)
    if (cachedString !== null) {
      return JSON.parse(cachedString) as T
    }
  } catch (error) {
    console.error('Redis get error:', error)
  }

  const value = await loader()

  if (value !== undefined) {
    try {
      await redis.set(key, JSON.stringify(value), {
        PX: ttlMs,
      })
    } catch (error) {
      console.error('Redis set error:', error)
    }
  }

  return value
}

export async function setCacheValue<T>(key: string, value: T, ttlMs: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), {
      PX: ttlMs,
    })
  } catch (error) {
    console.error('Redis set error:', error)
  }
}

export async function invalidateCacheKey(key: string): Promise<void> {
  try {
    await redis.del(key)
  } catch (error) {
    console.error('Redis delete error:', error)
  }
}
