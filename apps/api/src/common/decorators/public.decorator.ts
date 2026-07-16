import { SetMetadata } from "@nestjs/common";

/**
 * 公开路由标记：跳过全局 JwtAuthGuard 与 PermissionsGuard。
 *
 * 仅限四类场景：登录、刷新 token、健康检查、服务间端点（后者自带 ServiceAuthGuard，
 * @Public 只是让它绕过"用户 JWT"这层，服务令牌校验仍然生效）。
 * 新增 @Public 路由必须同步加入 authz-route-coverage.spec.ts 的白名单，否则 CI 红。
 */
export const IS_PUBLIC_KEY = "is_public";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
