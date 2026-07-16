import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./jwt.strategy";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { ClsModule } from "nestjs-cls";
import { PermissionsModule } from "../../common/permissions/permissions.module";
import { AppConfigService } from "../../config/app-config.service";
import { FederatedIdentityService } from "./federated-identity.service";
import { FederatedIdentityController } from "./federated-identity.controller";

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const jwt = config.jwt;
        return {
          secret: jwt.accessSecret,
          privateKey: jwt.accessAlgorithm === "RS256" ? jwt.accessPrivateKey : undefined,
          signOptions: {
            expiresIn: jwt.accessTtl,
            algorithm: jwt.accessAlgorithm,
            keyid: jwt.accessKeyId,
          },
        };
      },
    }),
    ClsModule,
    PermissionsModule,
  ],
  providers: [AuthService, JwtStrategy, FederatedIdentityService],
  controllers: [AuthController, FederatedIdentityController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
