import { describe, expect, it, vi } from "vitest";
import { ConversationMemoryService } from "./conversation-memory.service";

function createService() {
  const prisma = {
    qAConversation: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
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
    expect(prisma.qAConversation.update).not.toHaveBeenCalled();
  });

  it("达到阈值时调用 llm.chat 并更新 summary/summaryMessageCount", async () => {
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
    expect(prisma.qAConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { summary: "合并后的摘要", summaryMessageCount: 10 },
    });
  });

  it("会话不存在时直接返回，不做任何调用", async () => {
    const { service, prisma, db, llm } = createService();
    prisma.qAConversation.findUnique.mockResolvedValueOnce(null);

    await service.maybeUpdateSummary("conv-missing");

    expect(db.queryOne).not.toHaveBeenCalled();
    expect(llm.chat).not.toHaveBeenCalled();
    expect(prisma.qAConversation.update).not.toHaveBeenCalled();
  });
});
