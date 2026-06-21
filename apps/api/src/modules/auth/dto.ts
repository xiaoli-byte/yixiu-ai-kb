import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
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