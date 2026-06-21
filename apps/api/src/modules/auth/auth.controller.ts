import { Body, Controller, Get, Post, UseGuards, Req } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { LoginDto, RefreshDto } from "./dto";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @RateLimit({ ...RateLimitPolicies.auth, message: "登录尝试次数过多，请 15 分钟后再试" })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post("refresh")
  @RateLimit({ windowMs: 60 * 1000, max: 30, message: "刷新过于频繁" })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(AuthGuard("jwt"))
  @Get("me")
  me(@Req() req: any) {
    return { user: req.user };
  }
}
