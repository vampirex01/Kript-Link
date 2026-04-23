import { Redis } from "ioredis";
import { env } from "./env.js";

const memoryCache = new Map<string, { value: string; expiresAt: number }>();

let redisClient: Redis | null = null;

function getMemory(key: string): string | null {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

function setMemory(key: string, value: string, ttlSeconds?: number): void {
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0;
  memoryCache.set(key, { value, expiresAt });
}

function deleteMemory(key: string): void {
  memoryCache.delete(key);
}

export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    redisClient.on("error", (error: Error) => {
      console.error("Redis error", error.message);
    });

    return redisClient;
  } catch (error) {
    console.warn(
      "Failed to initialize Redis, falling back to in-memory cache",
      error,
    );
    redisClient = null;
    return null;
  }
}

export async function getAsync(key: string): Promise<string | null> {
  const client = getRedisClient();

  if (!client) {
    return getMemory(key);
  }

  try {
    return await client.get(key);
  } catch {
    return getMemory(key);
  }
}

export async function setAsync(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const client = getRedisClient();

  if (!client) {
    setMemory(key, value, ttlSeconds);
    return;
  }

  try {
    if (ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds);
      return;
    }

    await client.set(key, value);
  } catch {
    setMemory(key, value, ttlSeconds);
  }
}

export async function delAsync(key: string): Promise<void> {
  const client = getRedisClient();

  if (!client) {
    deleteMemory(key);
    return;
  }

  try {
    await client.del(key);
  } catch {
    deleteMemory(key);
  }
}
