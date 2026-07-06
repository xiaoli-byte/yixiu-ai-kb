import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ClsService } from "nestjs-cls";
import { JwtPayload } from "./auth.service";
import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: AppConfigService, private readonly cls: ClsService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwt.accessSecret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) throw new UnauthorizedException("Token 无效");
    this.cls.set("userId", payload.sub);
    this.cls.set("tenantId", payload.tenantId);
    this.cls.set("role", payload.role);
    return payload;
  }
}
