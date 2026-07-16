/**
 * 跨系统统一角色词表（docs/authz-architecture.md「内置角色跨系统对齐」）。
 *
 * canonical 词表：super_admin / tenant_admin / operator / viewer（ai-call 直接使用）。
 * ai-knowledge 本地词表：super_admin / admin / editor / viewer。
 *
 * 词表、层级、跨系统别名映射在本文件**唯一定义**，两侧系统一律从这里 import；
 * 消费侧复制这三样东西中的任何一份都是缺陷（历史教训：映射表只活在
 * ai-knowledge 的 jwt.strategy 里，ai-call 的 operator 联合登录后实际无权）。
 */

/** canonical（跨系统）角色词表 */
export const CANONICAL_ROLES = ["super_admin", "tenant_admin", "operator", "viewer"] as const;
export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

/** ai-knowledge 本地角色词表 */
export const KB_ROLES = ["super_admin", "admin", "editor", "viewer"] as const;
export type KbRole = (typeof KB_ROLES)[number];

/**
 * 角色层级（数值越大权限越高）。canonical 与 kb 本地名共用一张表：
 * tenant_admin ≡ admin，operator ≡ editor。
 */
export const ROLE_RANK: Readonly<Record<string, number>> = {
  super_admin: 4,
  tenant_admin: 3,
  admin: 3,
  operator: 2,
  editor: 2,
  viewer: 1,
};

/** canonical / ai-call 词表 → ai-knowledge 本地词表的别名映射（本地名自映射，保证幂等） */
export const TO_KB_ROLE: Readonly<Record<string, KbRole>> = {
  super_admin: "super_admin",
  tenant_admin: "admin",
  admin: "admin",
  operator: "editor",
  editor: "editor",
  viewer: "viewer",
};

export interface ResolveKbRoleResult {
  /** 可识别角色中层级最高者的本地名；全部不可识别（或无输入）时为 null */
  role: KbRole | null;
  /** 词表外无法识别的 claim 原文。策略上不猜测、不降级——由调用方决定拒绝并告警 */
  unknown: string[];
}

/**
 * 把 token 的角色 claims（单数 role / 复数 roles 拼在一起传入）解析为 ai-knowledge
 * 本地角色。多角色取映射后层级最高者；未知角色收集进 unknown 而非静默降级。
 */
export function resolveKbRole(
  claims: readonly (string | null | undefined)[],
): ResolveKbRoleResult {
  const unknown: string[] = [];
  let best: KbRole | null = null;
  for (const claim of claims) {
    if (!claim) continue;
    const mapped = TO_KB_ROLE[claim];
    if (!mapped) {
      unknown.push(claim);
      continue;
    }
    if (!best || (ROLE_RANK[mapped] ?? 0) > (ROLE_RANK[best] ?? 0)) {
      best = mapped;
    }
  }
  return { role: best, unknown };
}
