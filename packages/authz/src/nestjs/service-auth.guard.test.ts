import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceAuthGuard } from './service-auth.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

/**
 * KB-08: ServiceAuthGuard 单元测试
 *
 * 验证：
 * 1. service token 正确时放行
 * 2. service token 错误时拒绝
 * 3. 缺少 X-Tenant-Id 时拒绝
 * 4. 缺少 X-User-Id 时拒绝
 * 5. 身份正确注入到 CLS 和 request.user
 */
describe('ServiceAuthGuard', () => {
  let guard: ServiceAuthGuard;
  let clsService: ClsService;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      user: undefined,
    };

    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as any;

    clsService = {
      isActive: () => true,
      set: vi.fn(),
      get: vi.fn(),
    } as any;

    guard = new ServiceAuthGuard(clsService);
  });

  it('开发环境未配置 token 时放行，但要求 X-Tenant-Id 和 X-User-Id', () => {
    const originalEnv = process.env.SERVICE_API_TOKEN;
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.SERVICE_API_TOKEN;
    process.env.NODE_ENV = 'development';

    mockRequest.headers = {
      'x-tenant-id': 'tenant_a',
      'x-user-id': 'user_a',
    };

    const result = guard.canActivate(mockContext);
    expect(result).toBe(true);
    expect(clsService.set).toHaveBeenCalledWith('tenantId', 'tenant_a');
    expect(clsService.set).toHaveBeenCalledWith('userId', 'user_a');
    expect(mockRequest.user).toEqual({
      sub: 'user_a',
      userId: 'user_a',
      tenantId: 'tenant_a',
      role: 'viewer',
      roles: ['viewer'],
    });

    if (originalEnv) process.env.SERVICE_API_TOKEN = originalEnv;
    if (originalNodeEnv) process.env.NODE_ENV = originalNodeEnv;
  });

  it('生产环境未配置 token 时抛出异常', () => {
    const originalEnv = process.env.SERVICE_API_TOKEN;
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.SERVICE_API_TOKEN;
    process.env.NODE_ENV = 'production';

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);

    if (originalEnv) process.env.SERVICE_API_TOKEN = originalEnv;
    if (originalNodeEnv) process.env.NODE_ENV = originalNodeEnv;
  });

  it('service token 正确时放行', () => {
    const originalEnv = process.env.SERVICE_API_TOKEN;
    process.env.SERVICE_API_TOKEN = 'test-token';

    mockRequest.headers = {
      'x-service-token': 'test-token',
      'x-tenant-id': 'tenant_a',
      'x-user-id': 'user_a',
    };

    const result = guard.canActivate(mockContext);
    expect(result).toBe(true);
    expect(clsService.set).toHaveBeenCalledWith('tenantId', 'tenant_a');
    expect(clsService.set).toHaveBeenCalledWith('userId', 'user_a');

    if (originalEnv) process.env.SERVICE_API_TOKEN = originalEnv;
    else delete process.env.SERVICE_API_TOKEN;
  });

  it('service token 错误时拒绝', () => {
    const originalEnv = process.env.SERVICE_API_TOKEN;
    process.env.SERVICE_API_TOKEN = 'test-token';

    mockRequest.headers = {
      'x-service-token': 'wrong-token',
      'x-tenant-id': 'tenant_a',
      'x-user-id': 'user_a',
    };

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);

    if (originalEnv) process.env.SERVICE_API_TOKEN = originalEnv;
    else delete process.env.SERVICE_API_TOKEN;
  });

  it('缺少 X-Tenant-Id 时拒绝', () => {
    const originalEnv = process.env.SERVICE_API_TOKEN;
    process.env.SERVICE_API_TOKEN = 'test-token';

    mockRequest.headers = {
      'x-service-token': 'test-token',
      'x-user-id': 'user_a',
    };

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);

    if (originalEnv) process.env.SERVICE_API_TOKEN = originalEnv;
    else delete process.env.SERVICE_API_TOKEN;
  });

  it('缺少 X-User-Id 时拒绝', () => {
    const originalEnv = process.env.SERVICE_API_TOKEN;
    process.env.SERVICE_API_TOKEN = 'test-token';

    mockRequest.headers = {
      'x-service-token': 'test-token',
      'x-tenant-id': 'tenant_a',
    };

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);

    if (originalEnv) process.env.SERVICE_API_TOKEN = originalEnv;
    else delete process.env.SERVICE_API_TOKEN;
  });

  it('支持自定义 X-User-Role header', () => {
    const originalEnv = process.env.SERVICE_API_TOKEN;
    process.env.SERVICE_API_TOKEN = 'test-token';

    mockRequest.headers = {
      'x-service-token': 'test-token',
      'x-tenant-id': 'tenant_a',
      'x-user-id': 'user_a',
      'x-user-role': 'admin',
    };

    guard.canActivate(mockContext);

    expect(clsService.set).toHaveBeenCalledWith('role', 'admin');
    expect(mockRequest.user.role).toBe('admin');

    if (originalEnv) process.env.SERVICE_API_TOKEN = originalEnv;
    else delete process.env.SERVICE_API_TOKEN;
  });
});
