import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_SIGNATURE_TOLERANCE_MS = 300_000;

/**
 * ServiceAuthGuard - 服务间调用认证守卫
 *
 * 用于保护服务间 API 端点（如 ai-call → ai-knowledge 的 retrieve 调用）。
 *
 * 工作方式：
 * 1. 校验 X-Service-Token header 与环境变量 SERVICE_API_TOKEN 匹配
 * 2. 可选：如果 SERVICE_API_REQUIRE_SIGNATURE=true，额外校验时间戳签名
 * 3. 从 X-Tenant-Id 和 X-User-Id headers 提取租户/用户身份，写入 CLS
 * 4. 标记为系统上下文（绕过某些用户级验证，但**不绕过**租户过滤）
 *
 * 环境变量：
 * - SERVICE_API_TOKEN: 服务令牌（必需，生产环境）
 * - SERVICE_API_REQUIRE_SIGNATURE: 是否要求时间戳签名（可选，默认 false）
 * - SERVICE_API_SIGNING_SECRET: 签名密钥（可选，默认回退到 SERVICE_API_TOKEN）
 * - SERVICE_API_SIGNATURE_TOLERANCE_MS: 签名时间容差（可选，默认 300000ms）
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(@Optional() private readonly cls?: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.SERVICE_API_TOKEN;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Service token is not configured');
      }
      // 开发环境未配置服务令牌：放行，但提取并注入租户/用户身份到 CLS
      const request = context.switchToHttp().getRequest<{
        headers: Record<string, string | string[] | undefined>;
      }>();
      this.injectServiceCallerIdentity(request.headers, request);
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const provided = this.firstHeader(request.headers['x-service-token']);

    if (!provided || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid service token');
    }

    if (this.requiresSignature()) {
      this.assertValidSignature(request.headers, provided, expected);
    }

    // 服务令牌校验通过：从 headers 提取调用方身份（tenantId + userId）注入 CLS 和 request.user
    this.injectServiceCallerIdentity(request.headers, request);
    return true;
  }

  /**
   * 从服务调用 headers 提取 tenantId / userId，写入 CLS 和 request.user。
   *
   * ai-call 调用 ai-knowledge retrieve 时，必须在 header 中传递：
   * - X-Tenant-Id: 租户 ID（必需）
   * - X-User-Id: 用户 ID（必需，用于 ACL 判定）
   *
   * 这些身份将用于 visibleDocumentWhereSql() 的租户隔离和权限过滤。
   */
  private injectServiceCallerIdentity(
    headers: Record<string, string | string[] | undefined>,
    request?: any,
  ): void {
    const tenantId = this.firstHeader(headers['x-tenant-id']);
    const userId = this.firstHeader(headers['x-user-id']);
    const role = this.firstHeader(headers['x-user-role']) || 'viewer';

    if (!tenantId) {
      throw new UnauthorizedException(
        'Service call must provide X-Tenant-Id header',
      );
    }
    if (!userId) {
      throw new UnauthorizedException(
        'Service call must provide X-User-Id header',
      );
    }

    // 写入 CLS
    if (this.cls?.isActive()) {
      this.cls.set('tenantId', tenantId);
      this.cls.set('userId', userId);
      this.cls.set('role', role);
      // 标记为服务调用，但**不设置系统旁路** —— 租户过滤必须生效
      this.cls.set('isServiceCall', true);
    }

    // 写入 request.user，供 @CurrentUser() 装饰器读取
    if (request) {
      request.user = {
        sub: userId,
        userId,
        tenantId,
        role,
        roles: [role],
      };
    }
  }

  private assertValidSignature(
    headers: Record<string, string | string[] | undefined>,
    token: string,
    fallbackSecret: string,
  ): void {
    const timestamp = this.firstHeader(headers['x-service-timestamp']);
    const providedSignature = this.firstHeader(headers['x-service-signature']);
    if (!timestamp || !providedSignature) {
      throw new UnauthorizedException('Invalid service signature');
    }

    const timestampMs = Number(timestamp);
    if (
      !Number.isFinite(timestampMs) ||
      Math.abs(Date.now() - timestampMs) > this.signatureToleranceMs()
    ) {
      throw new UnauthorizedException('Service signature timestamp expired');
    }

    const signingSecret =
      process.env.SERVICE_API_SIGNING_SECRET || fallbackSecret;
    const expectedSignature = createHmac('sha256', signingSecret)
      .update(`${timestamp}.${token}`)
      .digest('hex');
    if (!this.safeEqual(providedSignature, expectedSignature)) {
      throw new UnauthorizedException('Invalid service signature');
    }
  }

  private requiresSignature(): boolean {
    return process.env.SERVICE_API_REQUIRE_SIGNATURE?.toLowerCase() === 'true';
  }

  private signatureToleranceMs(): number {
    const configured = process.env.SERVICE_API_SIGNATURE_TOLERANCE_MS;
    if (!configured) {
      return DEFAULT_SIGNATURE_TOLERANCE_MS;
    }
    const parsed = Number(configured);
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_SIGNATURE_TOLERANCE_MS;
  }

  private firstHeader(
    value: string | string[] | undefined,
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private safeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
