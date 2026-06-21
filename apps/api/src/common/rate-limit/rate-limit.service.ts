import { Injectable, Logger, Inject } from "@nestjs/common";
import IORedis from "ioredis";

export interface RateLimitOptions {
  /** 窗口大小（秒） */
  windowMs: number;
  /** 最大请求数 */
  max: number;
  /** Redis key 前缀 */
  keyPrefix?: string;
  /** 是否启用租户隔离 */
  byTenant?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  total: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly DEFAULT_WINDOW = 60; // 1 分钟
  private readonly DEFAULT_MAX = 100;

  constructor(@Inject("REDIS") private readonly redis: IORedis) {}

  /**
   * 检查是否允许请求
   * 使用滑动窗口算法（Sliding Window Log）
   */
  async check(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const { windowMs, max, keyPrefix = "rl" } = options;
    const windowSec = Math.ceil(windowMs / 1000);
    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `${keyPrefix}:${identifier}`;

    try {
      // 使用 Redis 事务保证原子性
      const pipeline = this.redis.pipeline();

      // 1. 删除窗口外的请求记录
      pipeline.zremrangebyscore(key, 0, windowStart);

      // 2. 获取当前窗口内的请求数
      pipeline.zcard(key);

      // 3. 添加当前请求
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // 4. 设置过期时间
      pipeline.expire(key, windowSec + 1);

      const results = await pipeline.exec();
      const currentCount = (results?.[1]?.[1] as number) || 0;

      const allowed = currentCount < max;
      const remaining = Math.max(0, max - currentCount - (allowed ? 1 : 0));
      const resetTime = now + windowMs;

      if (!allowed) {
        // 如果不允许，撤销刚才添加的请求
        await this.redis.zremrangebyscore(key, now, now);
      }

      return { allowed, remaining, resetTime, total: max };
    } catch (e: any) {
      this.logger.error(`Rate limit check failed: ${e.message}`);
      // Redis 故障时允许请求（fail-open）
      return { allowed: true, remaining: max, resetTime: now + windowMs, total: max };
    }
  }

  /**
   * 消费一次配额（用于更精确的控制）
   */
  async consume(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const { windowMs, max, keyPrefix = "rl" } = options;
    const windowSec = Math.ceil(windowMs / 1000);
    const now = Date.now();
    const key = `${keyPrefix}:${identifier}`;
    const requestId = `${now}-${Math.random()}`;

    try {
      const pipeline = this.redis.pipeline();

      pipeline.zremrangebyscore(key, 0, now - windowMs);
      pipeline.zadd(key, now, requestId);
      pipeline.zcard(key);
      pipeline.expire(key, windowSec + 1);

      const results = await pipeline.exec();
      const currentCount = (results?.[2]?.[1] as number) || 0;

      const allowed = currentCount <= max;
      const remaining = Math.max(0, max - currentCount);

      if (!allowed) {
        // 超限，删除这次请求
        await this.redis.zrem(key, requestId);
      }

      return {
        allowed,
        remaining: allowed ? remaining - 1 : remaining,
        resetTime: now + windowMs,
        total: max,
      };
    } catch (e: any) {
      this.logger.error(`Rate limit consume failed: ${e.message}`);
      return { allowed: true, remaining: max, resetTime: now + windowMs, total: max };
    }
  }

  /**
   * 重置限流计数器
   */
  async reset(identifier: string, keyPrefix = "rl"): Promise<void> {
    await this.redis.del(`${keyPrefix}:${identifier}`);
  }

  /**
   * 获取当前使用状态
   */
  async getStatus(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const { windowMs, max, keyPrefix = "rl" } = options;
    const now = Date.now();
    const key = `${keyPrefix}:${identifier}`;

    try {
      // 清理过期数据并获取当前计数
      await this.redis.zremrangebyscore(key, 0, now - windowMs);
      const count = await this.redis.zcard(key);

      return {
        allowed: count < max,
        remaining: Math.max(0, max - count),
        resetTime: now + windowMs,
        total: max,
      };
    } catch (e: any) {
      this.logger.error(`Rate limit status failed: ${e.message}`);
      return { allowed: true, remaining: max, resetTime: now + windowMs, total: max };
    }
  }
}
