import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { resolveKbRole } from "@xiaoli-byte/authz";
import { PRISMA } from "../../database/database.service";

const FEDERATED_PASSWORD_SENTINEL = "!federated-sso-no-local-login";
type FederatedStatus = "active" | "inactive";

export interface FederatedUserSyncInput {
  id: string;
  email: string;
  name: string;
  role: string;
  status: FederatedStatus;
}

/**
 * Service-to-service projection of ai-call identities.  This deliberately does
 * not link users by email: an existing local account with the same email is a
 * conflict that must be resolved by an operator, never an implicit takeover.
 */
@Injectable()
export class FederatedIdentityService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async sync(tenantId: string, raw: FederatedUserSyncInput) {
    const input = this.normalize(raw);
    const existing = await this.prisma.user.findUnique({ where: { id: input.id } });

    if (existing && existing.tenantId !== tenantId) {
      throw new ForbiddenException("Federated user belongs to another tenant");
    }

    const emailOwner = await this.prisma.user.findFirst({
      where: { tenantId, email: input.email },
      select: { id: true },
    });
    if (emailOwner && emailOwner.id !== input.id) {
      throw new ConflictException("Email is already bound to another knowledge-base account");
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const data = {
        email: input.email,
        name: input.name,
        role: input.role,
        status: input.status,
      };
      const saved = existing
        ? await tx.user.update({ where: { id: input.id }, data })
        : await tx.user.create({
            data: {
              id: input.id,
              tenantId,
              passwordHash: FEDERATED_PASSWORD_SENTINEL,
              ...data,
            },
          });
      await tx.membership.upsert({
        where: { userId_tenantId: { userId: input.id, tenantId } },
        create: { userId: input.id, tenantId, roles: [input.role] },
        update: { roles: [input.role] },
      });
      return saved;
    });
    return { id: user.id, status: user.status };
  }

  async remove(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) return { id, status: "deleted", existed: false };

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: "deleted", role: "viewer" },
      });
      await tx.membership.upsert({
        where: { userId_tenantId: { userId: id, tenantId } },
        create: { userId: id, tenantId, roles: ["viewer"] },
        update: { roles: ["viewer"] },
      });
    });
    return { id, status: "deleted", existed: true };
  }

  private normalize(raw: FederatedUserSyncInput): FederatedUserSyncInput {
    const id = raw?.id?.trim();
    const email = raw?.email?.trim().toLowerCase();
    const name = raw?.name?.trim();
    const { role, unknown } = resolveKbRole([raw?.role]);
    if (!id || !email || !name || !role || unknown.length > 0) {
      throw new ConflictException("Invalid federated identity payload");
    }
    if (raw.status !== "active" && raw.status !== "inactive") {
      throw new ConflictException("Invalid federated identity status");
    }
    return { id, email, name, role, status: raw.status };
  }
}
