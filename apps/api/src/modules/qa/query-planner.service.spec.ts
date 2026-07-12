import { describe, expect, it, vi } from "vitest";
import { QueryPlannerService } from "./query-planner.service";
import type { ConversationMemory } from "./conversation-memory.service";

function emptyMemory(): ConversationMemory {
  return { summary: "", recentMessages: [], totalMessages: 0 };
}

function historyMemory(): ConversationMemory {
  return {
    summary: "",
    recentMessages: [
      { role: "user", content: "介绍一下 A 产品" },
      { role: "assistant", content: "A 产品是……" },
    ],
    totalMessages: 2,
  };
}

function createService(isMock: boolean) {
  const llm = {
    isMock,
    chat: vi.fn(),
  };
  return { service: new QueryPlannerService(llm as any), llm };
}

describe("QueryPlannerService", () => {
  it("无历史时直接返回原问题，usedContext=false", async () => {
    const { service, llm } = createService(false);

    const plan = await service.plan("什么是知识库？", emptyMemory());

    expect(plan).toEqual({ retrievalQuery: "什么是知识库？", usedContext: false });
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it("llm mock 模式下有历史时返回启发式拼接结果，usedContext=true", async () => {
    const { service, llm } = createService(true);

    const plan = await service.plan("价格呢？", historyMemory());

    expect(plan.usedContext).toBe(true);
    expect(plan.retrievalQuery).toContain("价格呢？");
    expect(plan.retrievalQuery).toContain("介绍一下 A 产品");
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it("非 mock 模式下调用 llm.chat 改写并清洗输出", async () => {
    const { service, llm } = createService(false);
    llm.chat.mockResolvedValueOnce("改写后问题：A 产品的价格是多少？");

    const plan = await service.plan("价格呢？", historyMemory());

    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(plan.retrievalQuery).toBe("A 产品的价格是多少？");
    expect(plan.usedContext).toBe(true);
  });

  it("llm.chat 抛错时降级为启发式拼接", async () => {
    const { service, llm } = createService(false);
    llm.chat.mockRejectedValueOnce(new Error("LLM 超时"));

    const plan = await service.plan("价格呢？", historyMemory());

    expect(plan.usedContext).toBe(true);
    expect(plan.retrievalQuery).toContain("价格呢？");
    expect(plan.retrievalQuery).toContain("介绍一下 A 产品");
  });
});
