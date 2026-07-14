import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ConversationMemoryService } from "./conversation-memory.service";

function createService() {
  const prisma = {
    qAConversation: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  };
  const llm = {
    isMock: true,
    chat: vi.fn().mockResolvedValue("合并后的摘要"),
  };

  return {
    service: new ConversationMemoryService(prisma as any, db as any, llm as any),
    prisma,
    db,
    llm,
  };
}

describe("ConversationMemoryService load", () => {
  it("无会话 id 时直接返回空记忆，不查询数据库", async () => {
    const { service, prisma, db } = createService();

    const memory = await service.load(undefined);

    expect(memory).toEqual({ summary: "", recentMessages: [], totalMessages: 0 });
    expect(prisma.qAConversation.findUnique).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("有会话 id 时加载摘要、最近消息与总数", async () => {
    const { service, prisma, db } = createService();
    prisma.qAConversation.findUnique.mockResolvedValueOnce({ summary: " 历史摘要 " });
    db.query.mockResolvedValueOnce([
      { role: "user", content: "问题1" },
      { role: "assistant", content: "回答1" },
    ]);
    db.queryOne.mockResolvedValueOnce({ count: "12" });

    const memory = await service.load("conv-1");

    expect(memory.summary).toBe("历史摘要");
    expect(memory.recentMessages).toEqual([
      { role: "user", content: "问题1" },
      { role: "assistant", content: "回答1" },
    ]);
    expect(memory.totalMessages).toBe(12);
  });

  it("最近消息查询以 created_at + id 作为稳定排序，内外层方向一致", async () => {
    const { service, prisma, db } = createService();
    prisma.qAConversation.findUnique.mockResolvedValueOnce({ summary: "" });
    db.queryOne.mockResolvedValueOnce({ count: "0" });

    await service.load("conv-1");

    const sql = db.query.mock.calls[0][0] as string;
    // 内层取最近 N 条：按时间倒序，同毫秒按 id 倒序
    expect(sql).toMatch(/ORDER BY created_at DESC, id DESC/);
    // 外层还原成时间正序：同毫秒按 id 正序，与内层方向对应一致
    expect(sql).toMatch(/ORDER BY created_at ASC, id ASC/);
  });
});

describe("ConversationMemoryService maybeUpdateSummary", () => {
  it("未摘要消息数不足阈值时不调用 llm，也不更新摘要", async () => {
    const { service, prisma, db, llm } = createService();
    prisma.qAConversation.findUnique.mockResolvedValueOnce({
      summary: "",
      summaryMessageCount: 0,
    });
    // 总消息 12 条，最近 10 条保留原文，未摘要覆盖点为 2，小于阈值 6
    db.queryOne.mockResolvedValueOnce({ count: "12" });

    await service.maybeUpdateSummary("conv-1");

    expect(llm.chat).not.toHaveBeenCalled();
    expect(prisma.qAConversation.updateMany).not.toHaveBeenCalled();
  });

  it("达到阈值时调用 llm.chat 并通过 updateMany 乐观更新 summary/summaryMessageCount", async () => {
    const { service, prisma, db, llm } = createService();
    prisma.qAConversation.findUnique.mockResolvedValueOnce({
      summary: "旧摘要",
      summaryMessageCount: 0,
    });
    // 总消息 20 条，覆盖点 = 20 - 10 = 10，10 - 0 = 10 >= 阈值 6
    db.queryOne.mockResolvedValueOnce({ count: "20" });
    db.query.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `消息${i}`,
      })),
    );

    await service.maybeUpdateSummary("conv-1");

    expect(llm.chat).toHaveBeenCalledTimes(1);
    // 增量素材查询同样以 created_at + id 作为稳定排序，保证与 load() 的分页窗口不错位
    const incrementalSql = db.query.mock.calls[0][0] as string;
    expect(incrementalSql).toMatch(/ORDER BY created_at ASC, id ASC/);
    // where 带上读取时的 summaryMessageCount 旧值，实现乐观并发控制
    expect(prisma.qAConversation.updateMany).toHaveBeenCalledWith({
      where: { id: "conv-1", summaryMessageCount: 0 },
      data: { summary: "合并后的摘要", summaryMessageCount: 10 },
    });
  });

  it("updateMany 返回 count 0（并发更新已发生）时放弃本次写入且不抛错", async () => {
    const { service, prisma, db } = createService();
    prisma.qAConversation.findUnique.mockResolvedValueOnce({
      summary: "旧摘要",
      summaryMessageCount: 0,
    });
    db.queryOne.mockResolvedValueOnce({ count: "20" });
    db.query.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `消息${i}`,
      })),
    );
    prisma.qAConversation.updateMany.mockResolvedValueOnce({ count: 0 });
    const warnSpy = vi.spyOn(Logger.prototype, "warn");

    await expect(service.maybeUpdateSummary("conv-1")).resolves.toBeUndefined();

    // count 为 0 是预期内的并发跳过分支，不应落入 catch 块记 warn（下一轮会自愈）
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("会话不存在时直接返回，不做任何调用", async () => {
    const { service, prisma, db, llm } = createService();
    prisma.qAConversation.findUnique.mockResolvedValueOnce(null);

    await service.maybeUpdateSummary("conv-missing");

    expect(db.queryOne).not.toHaveBeenCalled();
    expect(llm.chat).not.toHaveBeenCalled();
    expect(prisma.qAConversation.updateMany).not.toHaveBeenCalled();
  });
});
