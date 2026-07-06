import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { loadRootEnv, projectRootDir, validateEnv } from "../config/env";

loadRootEnv();
validateEnv(process.env);

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

async function main() {
  // 用文件锁做幂等标记，避免重复执行 seed
  const lockDir = resolve(projectRootDir(), ".seed_locks");
  const lockFile = resolve(lockDir, "0001_seed_data.lock");

  if (existsSync(lockFile)) {
    console.log("[seed] 已执行，跳过");
    return;
  }

  const tenantId = process.env.BOOTSTRAP_TENANT_ID!;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL!;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD!;
  const name = process.env.BOOTSTRAP_ADMIN_NAME!;

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

  // tags
  const tagNames = ["产品", "技术", "人事", "财务", "客户"];
  const tags: Record<string, string> = {};
  for (const tn of tagNames) {
    const t = await prisma.tag.upsert({
      where: { name_type: { name: tn, type: "DOMAIN" } },
      update: {},
      create: { id: uuid(), name: tn, type: "DOMAIN" },
    });
    tags[tn] = t.id;
  }
  console.log(`✓ 标签: ${Object.keys(tags).length} 个`);

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
