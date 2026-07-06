import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('redis.url') || 'redis://localhost:6379';
    // Connecting to Redis URL (Upstash or local). Upstash works out of the box via SSL (rediss://)
    this.redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ if the connection is reused
    });

    try {
      const keys = await this.redisClient.keys('chat:response:*');
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
        console.log(`[RedisService] Flushed ${keys.length} stale cached chat responses on startup.`);
      }
    } catch (err) {
      console.warn(`[RedisService] Failed to flush cached responses on startup: ${err.message}`);
    }
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  getClient(): Redis {
    return this.redisClient;
  }

  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redisClient.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }
}
