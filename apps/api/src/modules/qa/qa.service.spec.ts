import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { QaService } from "./qa.service";
import type { SearchHit } from "../search/search.service";
import type { ConversationMemory } from "./conversation-memory.service";

function createHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    contentId: "content-1",
    documentTitle: "Document 1",
    mime: "text/plain",
    idx: 0,
    text: "document text",
    highlight: "document text",
    score: 0.9,
    sources: ["bm25"],
    page: null,
    ...overrides,
  };
}

function accessFlags(canView: boolean, canDownload = false) {
  return {
    canView,
    canDownload,
    canEdit: false,
    canDelete: false,
    canManagePermission: false,
  };
}

function emptyMemory(): ConversationMemory {
  return { summary: "", recentMessages: [], totalMessages: 0 };
}

/** 默认 streamChat mock：直接调用 onChunk 若干次后 resolve 全文，贴近真实流式行为 */
function streamChatMock(fullText = "(mock) 回答内容") {
  return vi.fn(async (_messages: unknown, cb: { onChunk: (d: string) => void }) => {
    cb.onChunk(fullText);
    return fullText;
  });
}

function createService() {
  const prisma = {
    qAConversation: {
      create: vi.fn().mockResolvedValue({ id: "conv-1" }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    qAMessage: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    document: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ role: "viewer", departmentId: "dept-1" }),
    },
  };
  const db = {
    tenantId: "tenant-1",
    userId: "user-1",
    role: "viewer",
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  };
  const search = {
    search: vi.fn().mockResolvedValue({ hits: [], took: 1, hasRelevantResults: false }),
  };
  const llm = {
    isMock: true,
    chat: vi.fn(),
    streamChat: streamChatMock(),
  };
  const storage = {
    getObject: vi.fn(),
    getObjectStream: vi.fn(),
  };
  const access = {
    getAccessFlags: vi.fn().mockResolvedValue({}),
    assertDocumentAccess: vi.fn().mockResolvedValue(undefined),
  };
  const config = {
    appTimeZone: "Asia/Shanghai",
  };
  const rerank = {
    isMock: true,
    rerank: vi.fn(async (_q: string, documents: string[]) =>
      documents.map((_, index) => ({ index, score: 1 - index * 0.01 })),
    ),
  };
  const memory = {
    load: vi.fn().mockResolvedValue(emptyMemory()),
    maybeUpdateSummary: vi.fn().mockResolvedValue(undefined),
  };
  const planner = {
    plan: vi.fn(async (question: string) => ({ retrievalQuery: question, usedContext: false })),
  };
  const runLog = {
    log: vi.fn().mockResolvedValue(undefined),
    listDebugRuns: vi.fn(),
  };

  return {
    service: new QaService(
      prisma as any,
      db as any,
      search as any,
      llm as any,
      storage as any,
      access as any,
      config as any,
      rerank as any,
      memory as any,
      planner as any,
      runLog as any,
    ),
    prisma,
    db,
    search,
    llm,
    storage,
    access,
    rerank,
    memory,
    planner,
    runLog,
  };
}

/** 组装一次成功 ask 调用的通用回调集合 */
function askCallbacks() {
  return {
    onChunk: vi.fn(),
    onCitations: vi.fn(),
    onNoResults: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

describe("QaService ask 主流程", () => {
  it("happy path：召回命中 -> 权限过滤 -> citations 编号 -> messages 结构 -> 落库 -> 回调顺序", async () => {
    const { service, prisma, db, search, access, llm, runLog } = createService();
    const hit = createHit({
      chunkId: "chunk-allowed",
      documentId: "doc-allowed",
      contentId: "content-allowed",
      documentTitle: "Allowed Handbook",
      text: "allowed chunk text",
    });
    search.search.mockResolvedValueOnce({ hits: [hit], took: 1, hasRelevantResults: true });
    access.getAccessFlags.mockResolvedValueOnce({ "doc-allowed": accessFlags(true, true) });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("ai_reference_enabled")) {
        return [{ id: "doc-allowed", aiReferenceEnabled: true }];
      }
      return [];
    });

    const calls: string[] = [];
    const cb = askCallbacks();
    cb.onCitations.mockImplementation(() => calls.push("onCitations"));
    cb.onDone.mockImplementation(() => calls.push("onDone"));

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "如何配置定价？",
      topK: 5,
      ...cb,
    });

    // citations 编号从 1 开始
    expect(cb.onCitations).toHaveBeenCalledWith([
      expect.objectContaining({
        index: 1,
        chunkId: "chunk-allowed",
        documentId: "doc-allowed",
        contentId: "content-allowed",
        snippet: "allowed chunk text",
      }),
    ]);

    // messages 结构：[system, ...历史(空), 本轮user]
    const messages = llm.streamChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[messages.length - 1].role).toBe("user");
    expect(messages[messages.length - 1].content).toContain("【参考资料】");
    expect(messages[messages.length - 1].content).toContain("【当前问题】");
    expect(messages[messages.length - 1].content).toContain("allowed chunk text");
    expect(messages[messages.length - 1].content).toContain("如何配置定价？");

    // assistant 消息落库（user 消息 + assistant 消息共两次 create）
    expect(prisma.qAMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.qAMessage.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ role: "assistant" }),
      }),
    );

    // runLog 记录
    expect(runLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ question: "如何配置定价？", answer: expect.any(String) }),
    );

    // onCitations 先于 onDone
    expect(calls).toEqual(["onCitations", "onDone"]);
    expect(cb.onDone).toHaveBeenCalledWith(expect.any(String), "conv-1");
  });

  it("包含历史消息时 messages 结构为 [system, ...历史, 本轮user]", async () => {
    const { service, prisma, search, access, db, llm, memory } = createService();
    prisma.qAConversation.findFirst.mockResolvedValueOnce({ id: "conv-1" });
    memory.load.mockResolvedValueOnce({
      summary: "此前讨论了定价策略",
      recentMessages: [
        { role: "user", content: "上一轮问题" },
        { role: "assistant", content: "上一轮回答" },
      ],
      totalMessages: 2,
    });
    const hit = createHit({ documentId: "doc-a", text: "text a" });
    search.search.mockResolvedValueOnce({ hits: [hit], took: 1, hasRelevantResults: true });
    access.getAccessFlags.mockResolvedValueOnce({ "doc-a": accessFlags(true) });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("ai_reference_enabled")) {
        return [{ id: "doc-a", aiReferenceEnabled: true }];
      }
      return [];
    });
    const cb = askCallbacks();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      question: "追问一下",
      ...cb,
    });

    const messages = llm.streamChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[0].content).toContain("此前讨论了定价策略");
    expect(messages[1].content).toBe("上一轮问题");
    expect(messages[2].content).toBe("上一轮回答");
  });

  it("权限过滤：canView=false 或 ai_reference_enabled=false 的文档被排除", async () => {
    const { service, search, access, db, llm } = createService();
    const allowed = createHit({
      chunkId: "chunk-allowed",
      documentId: "doc-allowed",
      text: "allowed chunk text",
    });
    const aiDisabled = createHit({
      chunkId: "chunk-ai-disabled",
      documentId: "doc-ai-disabled",
      text: "ai disabled chunk text",
    });
    const denied = createHit({
      chunkId: "chunk-denied",
      documentId: "doc-denied",
      text: "denied chunk text",
    });
    search.search.mockResolvedValueOnce({
      hits: [allowed, aiDisabled, denied],
      took: 1,
      hasRelevantResults: true,
    });
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-allowed": accessFlags(true, true),
      "doc-ai-disabled": accessFlags(true, true),
      "doc-denied": accessFlags(false, false),
    });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("ai_reference_enabled")) {
        return [
          { id: "doc-allowed", aiReferenceEnabled: true },
          { id: "doc-ai-disabled", aiReferenceEnabled: false },
          { id: "doc-denied", aiReferenceEnabled: true },
        ];
      }
      return [];
    });
    const cb = askCallbacks();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "定价问题",
      ...cb,
    });

    expect(cb.onCitations).toHaveBeenCalledWith([
      expect.objectContaining({ documentId: "doc-allowed" }),
    ]);
    const messages = llm.streamChat.mock.calls[0][0] as Array<{ content: string }>;
    const prompt = messages.map((m) => m.content).join("\n");
    expect(prompt).toContain("allowed chunk text");
    expect(prompt).not.toContain("ai disabled chunk text");
    expect(prompt).not.toContain("denied chunk text");
  });

  it("rerank 抛错时降级为召回原始顺序，onDone 仍正常触发", async () => {
    const { service, search, access, db, rerank, llm } = createService();
    const hitA = createHit({ chunkId: "chunk-a", documentId: "doc-a", text: "text a" });
    const hitB = createHit({ chunkId: "chunk-b", documentId: "doc-b", text: "text b" });
    search.search.mockResolvedValueOnce({
      hits: [hitA, hitB],
      took: 1,
      hasRelevantResults: true,
    });
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-a": accessFlags(true),
      "doc-b": accessFlags(true),
    });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("ai_reference_enabled")) {
        return [
          { id: "doc-a", aiReferenceEnabled: true },
          { id: "doc-b", aiReferenceEnabled: true },
        ];
      }
      return [];
    });
    rerank.rerank.mockRejectedValueOnce(new Error("rerank service down"));
    const cb = askCallbacks();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "对比问题",
      ...cb,
    });

    expect(cb.onCitations).toHaveBeenCalledWith([
      expect.objectContaining({ documentId: "doc-a", index: 1 }),
      expect.objectContaining({ documentId: "doc-b", index: 2 }),
    ]);
    expect(cb.onDone).toHaveBeenCalledWith(expect.any(String), "conv-1");
    expect(cb.onError).not.toHaveBeenCalled();
    expect(llm.streamChat).toHaveBeenCalledTimes(1);
  });

  it("无命中时 onNoResults 被调用且流程继续（llm 仍被调用）", async () => {
    const { service, search, llm } = createService();
    search.search.mockResolvedValueOnce({ hits: [], took: 1, hasRelevantResults: false });
    const cb = askCallbacks();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "冷门问题",
      ...cb,
    });

    expect(cb.onNoResults).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String)]),
    );
    expect(cb.onCitations).not.toHaveBeenCalled();
    expect(llm.streamChat).toHaveBeenCalledTimes(1);
    expect(cb.onDone).toHaveBeenCalled();
  });

  it("会话不属于当前用户时触发 onError(ForbiddenException)", async () => {
    const { service, prisma, llm } = createService();
    prisma.qAConversation.findFirst.mockResolvedValueOnce(null);
    const cb = askCallbacks();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      conversationId: "conv-other",
      question: "继续追问",
      ...cb,
    });

    expect(cb.onError).toHaveBeenCalledWith(expect.any(ForbiddenException));
    expect(llm.streamChat).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
  });

  it("llm.streamChat 抛错时 onError 被调用且错误写入 runLog", async () => {
    const { service, search, access, db, llm, runLog } = createService();
    const hit = createHit({ documentId: "doc-a", text: "text a" });
    search.search.mockResolvedValueOnce({ hits: [hit], took: 1, hasRelevantResults: true });
    access.getAccessFlags.mockResolvedValueOnce({ "doc-a": accessFlags(true) });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("ai_reference_enabled")) {
        return [{ id: "doc-a", aiReferenceEnabled: true }];
      }
      return [];
    });
    const streamError = new Error("LLM 网关超时");
    llm.streamChat.mockRejectedValueOnce(streamError);
    const cb = askCallbacks();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "会超时的问题",
      ...cb,
    });

    expect(cb.onError).toHaveBeenCalledWith(streamError);
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(runLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ error: "LLM 网关超时" }),
    );
  });
});

describe("QaService updateMessageFeedback", () => {
  it("非法 rating 抛出 BadRequestException", async () => {
    const { service } = createService();

    await expect(
      service.updateMessageFeedback({
        messageId: "msg-1",
        tenantId: "tenant-1",
        userId: "user-1",
        rating: "invalid",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("消息不存在或不属于当前用户/租户时抛出 ForbiddenException", async () => {
    const { service, db } = createService();
    db.queryOne.mockResolvedValueOnce(null);

    await expect(
      service.updateMessageFeedback({
        messageId: "msg-1",
        tenantId: "tenant-1",
        userId: "user-1",
        rating: "up",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("只允许对 assistant 消息评价，user 消息抛出 BadRequestException", async () => {
    const { service, db } = createService();
    db.queryOne.mockResolvedValueOnce({ id: "msg-1", role: "user" });

    await expect(
      service.updateMessageFeedback({
        messageId: "msg-1",
        tenantId: "tenant-1",
        userId: "user-1",
        rating: "up",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
