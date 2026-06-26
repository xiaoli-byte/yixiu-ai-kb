import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

// ts-node 解析下 __dirname 行为不稳定,逐级向上找仓库根的 .env
function findEnv(): string | null {
  const candidates = [
    resolve(__dirname, "../../../../.env"),
    resolve(__dirname, "../../../.env"),
    resolve(__dirname, "../../.env"),
    resolve(__dirname, "../.env"),
    resolve(process.cwd(), ".env"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const envPath = findEnv();
if (envPath) {
  // 手写最小化 dotenv(避免 ts-node ESM/CJS 互操作下 dotenv import 行为不一致)
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} else {
  console.warn(`[seed] WARN: 未找到 .env,搜索路径:\n  ${resolve(__dirname, "../../../../.env")}`);
}

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";

const prisma = new PrismaClient();

async function main() {
  // 用文件锁做幂等标记，避免重复执行 seed
  const lockDir = resolve(__dirname, "../../../../.seed_locks");
  const lockFile = resolve(lockDir, "0001_seed_data.lock");

  if (existsSync(lockFile)) {
    console.log("[seed] 已执行，跳过");
    return;
  }

  const tenantId = process.env.BOOTSTRAP_TENANT_ID || "tenant_demo";
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@demo.com";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "demo123";
  const name = process.env.BOOTSTRAP_ADMIN_NAME || "Demo Admin";

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
  console.log("登录: admin@demo.com / demo123");

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