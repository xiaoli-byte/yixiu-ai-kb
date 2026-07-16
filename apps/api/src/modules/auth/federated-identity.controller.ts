import { Body, Controller, Delete, Param, Put, UseGuards } from "@nestjs/common";
import { ServiceAuthGuard } from "@xiaoli-byte/authz";
import { DatabaseService } from "../../database/database.service";
import { Public } from "../../common/decorators/public.decorator";
import { FederatedIdentityService, FederatedUserSyncInput } from "./federated-identity.service";

/** Internal CALL-13 endpoint, authenticated solely by the service token. */
@Controller("federation/users")
export class FederatedIdentityController {
  constructor(
    private readonly identities: FederatedIdentityService,
    private readonly db: DatabaseService,
  ) {}

  @Put("sync")
  @Public()
  @UseGuards(ServiceAuthGuard)
  sync(@Body() input: FederatedUserSyncInput) {
    return this.identities.sync(this.db.tenantId!, input);
  }

  @Delete(":id")
  @Public()
  @UseGuards(ServiceAuthGuard)
  remove(@Param("id") id: string) {
    return this.identities.remove(this.db.tenantId!, id);
  }
}
