import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { Role } from "../permissions/permissions.types";

/**
 * 管理员守卫（向后兼容）
 * 支持 super_admin 和 admin 角色
 * 推荐使用新的 @RequireRoles 或 @RequireMinRole 装饰器
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const role = this.cls.get<string>("role");
    // 支持 super_admin 和 admin 角色
    if (role !== Role.SUPER_ADMIN && role !== Role.ADMIN) {
      throw new ForbiddenException("需要管理员权限");
    }
    return true;
  }
}
