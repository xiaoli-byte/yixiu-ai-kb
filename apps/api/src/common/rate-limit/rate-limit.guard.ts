import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { RateLimitService, RateLimitOptions } from "./rate-limit.service";
import { DatabaseService } from "../../database/database.service";

export const RATE_LIMIT_KEY = "rate_limit";

/**
 * 速率限制装饰器选项
 */
export interface RateLimitDecoratorOptions {
  /** 窗口大小（毫秒） */
  windowMs?: number;
  /** 最大请求数 */
  max?: number;
  /** 自定义 key 前缀 */
  keyPrefix?: string;
  /** 错误消息 */
  message?: string;
}

/**
 * 速率限制装饰器
 * 使用方式：@RateLimit({ windowMs: 60000, max: 100 })
 */
export const RateLimit = (options: RateLimitDecoratorOptions = {}) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * 预定义的速率限制策略
 */
export const RateLimitPolicies = {
  // 登录接口 - 严格限制，防止暴力破解
  auth: { windowMs: 15 * 60 * 1000, max: 5 }, // 15分钟 5 次

  // 普通 API - 标准限制
  api: { windowMs: 60 * 1000, max: 100 }, // 1分钟 100 次

  // 搜索接口 - 中等限制
  search: { windowMs: 60 * 1000, max: 30 }, // 1分钟 30 次

  // 上传接口 - 较严格（资源密集型）
  upload: { windowMs: 60 * 1000, max: 10 }, // 1分钟 10 次

  // 文档处理 - 严格限制
  process: { windowMs: 60 * 1000, max: 5 }, // 1分钟 5 次

  // 问答接口 - 中等限制
  qa: { windowMs: 60 * 1000, max: 20 }, // 1分钟 20 次

  // 全局限流 - 宽松限制
  global: { windowMs: 60 * 1000, max: 200 }, // 1分钟 200 次
} as const;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    // 获取装饰器配置的限流选项
    const options = this.reflector.get<RateLimitDecoratorOptions>(
      RATE_LIMIT_KEY,
      handler,
    );

    // 如果没有配置，跳过限流
    if (!options) {
      return true;
    }

    // 获取请求上下文
    const request = context.switchToHttp().getRequest<Request>();
    const identifier = this.getIdentifier(request, options.keyPrefix);

    const rateOptions: RateLimitOptions = {
      windowMs: options.windowMs ?? 60 * 1000,
      max: options.max ?? 100,
      keyPrefix: options.keyPrefix ?? "rl",
    };

    const result = await this.rateLimitService.check(identifier, rateOptions);

    // 设置响应头
    const response = context.switchToHttp().getResponse();
    response.setHeader("X-RateLimit-Limit", result.total);
    response.setHeader("X-RateLimit-Remaining", result.remaining);
    response.setHeader("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      response.setHeader("Retry-After", retryAfter);

      this.logger.warn(
        `Rate limit exceeded for ${identifier}: ${options.message ?? "请求过于频繁"}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: options.message ?? "请求过于频繁，请稍后再试",
          error: "Too Many Requests",
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * 获取限流标识符
   * 优先级：用户ID > IP地址
   */
  private getIdentifier(request: Request, prefix?: string): string {
    // 优先使用用户 ID（已登录）
    const userId = this.db.userId;
    if (userId) {
      return prefix ? `${prefix}:user:${userId}` : `user:${userId}`;
    }

    // 降级到租户 ID
    const tenantId = this.db.tenantId;
    if (tenantId) {
      return prefix ? `${prefix}:tenant:${tenantId}` : `tenant:${tenantId}`;
    }

    // 最后使用 IP 地址
    const ip = this.getClientIp(request);
    return prefix ? `${prefix}:ip:${ip}` : `ip:${ip}`;
  }

  /**
   * 获取客户端 IP 地址
   */
  private getClientIp(request: Request): string {
    return (
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (request.headers["x-real-ip"] as string) ||
      request.socket.remoteAddress ||
      "unknown"
    );
  }
}
