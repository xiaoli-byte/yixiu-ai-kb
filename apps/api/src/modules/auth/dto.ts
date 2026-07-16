import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  password!: string;
}

export class RefreshDto {
  // 仅兼容正在升级中的非浏览器客户端；浏览器仅使用 httpOnly refresh cookie。
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsEnum(["viewer", "editor", "admin"])
  role?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(["viewer", "editor", "admin"])
  role?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
