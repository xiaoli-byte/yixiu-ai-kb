import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { loadRootEnv, projectRootDir, validateEnv } from "../config/env";

loadRootEnv();
const env = validateEnv(process.env);

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";

const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
});

async function main() {
  // 用文件锁做幂等标记，避免重复执行 seed
  const lockDir = resolve(projectRootDir(), ".seed_locks");
  const lockFile = resolve(lockDir, "0001_seed_data.lock");

  if (existsSync(lockFile)) {
    console.log("[seed] 已执行，跳过");
    return;
  }

  const tenantId = env.BOOTSTRAP_TENANT_ID;
  const email = env.BOOTSTRAP_ADMIN_EMAIL;
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = env.BOOTSTRAP_ADMIN_NAME;

  // KB-01: Tenant.id is intentionally the same literal string already used everywhere
  // as the bare `tenant_id` column value — see schema.prisma's comment on Tenant.
  const tenant = await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: {
      id: tenantId,
      slug: tenantId,
      name: `Bootstrap Tenant (${tenantId})`,
      status: "active",
    },
  });
  console.log(`✓ 租户: ${tenant.name} (${tenant.id})`);

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: {},
    create: {
      id: uuid(),
      tenantId,
      email,
      name,
      passwordHash,
      role: "super_admin",
    },
  });
  console.log(`✓ 用户: ${admin.email} (${admin.role})`);

  // KB-02: 迁移 0009 的回填只覆盖“迁移那一刻已存在的用户”。全新部署时 migrate 先于 seed
  // 执行、users 表为空，回填插入 0 行；因此 admin 的 Membership 必须在这里补出来，
  // 否则全新环境的 admin 会没有任何 membership（KB-04/KB-05 切到 Membership 读路径后会被锁死）。
  // 复合键 (userId, tenantId) upsert 保持幂等；roles 与 User.role 对齐。
  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId } },
    update: {},
    create: {
      userId: admin.id,
      tenantId,
      roles: [admin.role],
    },
  });
  console.log(`✓ 成员关系: ${membership.userId} @ ${membership.tenantId} [${membership.roles.join(", ")}]`);

  // 示例文档（仅元数据，不入文件）
  const samples = [
    { title: "Qwen3 技术白皮书.md", mime: "text/markdown" },
    { title: "2026 年产品规划 v1.0.md", mime: "text/markdown" },
    { title: "新人入职指南.md", mime: "text/markdown" },
  ];
  for (const s of samples) {
    const existing = await prisma.document.findFirst({
      where: { tenantId, title: s.title },
    });
    if (existing) {
      console.log(`✓ 文档已存在: ${s.title}`);
      continue;
    }
    const id = uuid();
    const doc = await prisma.document.create({
      data: {
        id,
        tenantId,
        ownerId: admin.id,
        title: s.title,
        mime: s.mime,
        size: BigInt(1024 * 10),
        status: "PENDING",
        storageKey: `${tenantId}/${id}.md`,
      },
    });
    console.log(`✓ 文档: ${doc.title}`);
  }

  console.log("\nSeed 完成！");
  console.log(`登录: ${email} / <BOOTSTRAP_ADMIN_PASSWORD>`);

  // 写入锁文件，确保重复执行时跳过
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(lockFile, JSON.stringify({ applied_at: new Date().toISOString() }), "utf-8");
  console.log(`[seed] 锁文件已写入: ${lockFile}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
