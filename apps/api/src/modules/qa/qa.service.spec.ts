import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { QaService } from "./qa.service";
import type { RagRoute } from "../rag/rag.types";

function createRoute(question = "pricing automation CRM"): RagRoute {
  return {
    originalQuestion: question,
    retrievalQuery: `${question} contract`,
    domain: "default",
    intent: "open_qa",
    profile: {
      domain: "default",
      displayName: "Default",
      riskLevel: "low",
      retrievalBoostTerms: [],
      factEntityTypes: [],
      tools: [],
      answerPolicy: [],
    },
    requiresFacts: false,
    requiresTool: false,
    warnings: [],
  };
}

function createService() {
  const prisma = {
    qAConversation: {
      create: vi.fn().mockResolvedValue({ id: "conv-1" }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn(),
      findFirst: vi.fn(),
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
  };
  const db = {
    tenantId: "tenant-1",
    userId: "user-1",
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn(),
  };
  const search = {
    search: vi.fn().mockResolvedValue({
      hits: [],
      took: 1,
      hasRelevantResults: false,
    }),
  };
  const llm = {
    isMock: true,
    chat: vi.fn(),
    streamChat: vi.fn(async (_messages: unknown, handlers: { onDone: () => void }) => {
      handlers.onDone();
    }),
  };
  const storage = {
    getObject: vi.fn(),
    getObjectStream: vi.fn(),
  };
  const config = {
    appTimeZone: "Asia/Shanghai",
  };
  const ragRouter = {
    route: vi.fn(({ question }) => createRoute(question)),
  };
  const ragFacts = {
    findFacts: vi.fn().mockResolvedValue([]),
    logQaRun: vi.fn().mockResolvedValue(undefined),
  };
  const ragTools = {
    run: vi.fn().mockResolvedValue(null),
  };
  const ragExtractor = {
    extractFactsFromSearchHits: vi.fn().mockResolvedValue([]),
  };

  return {
    service: new QaService(
      prisma as any,
      db as any,
      search as any,
      llm as any,
      storage as any,
      config as any,
      ragRouter as any,
      ragFacts as any,
      ragTools as any,
      ragExtractor as any,
    ),
    prisma,
    db,
    search,
    llm,
    ragFacts,
  };
}

describe("QaService feedback", () => {
  it("updates assistant-message feedback scoped to the conversation owner", async () => {
    const { service, db } = createService();
    db.queryOne
      .mockResolvedValueOnce({ id: "msg-1", role: "assistant" })
      .mockResolvedValueOnce({
        feedbackRating: "up",
        feedbackText: "Helpful source",
        feedbackAt: new Date("2026-07-07T01:02:03.000Z"),
      });

    const result = await (service as any).updateMessageFeedback({
      messageId: "msg-1",
      tenantId: "tenant-1",
      userId: "user-1",
      rating: "up",
      feedbackText: "  Helpful source  ",
    });

    expect(result).toEqual({
      rating: "up",
      text: "Helpful source",
      updatedAt: "2026-07-07T01:02:03.000Z",
    });
    expect(db.queryOne).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("qa_conversations"),
      ["msg-1", "user-1", "tenant-1"],
    );
    expect(db.queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("feedback_rating"),
      ["msg-1", "up", "Helpful source"],
    );
  });

  it("rejects feedback for messages outside the current user and tenant scope", async () => {
    const { service, db } = createService();
    db.queryOne.mockResolvedValueOnce(null);

    await expect(
      (service as any).updateMessageFeedback({
        messageId: "msg-1",
        tenantId: "tenant-1",
        userId: "user-1",
        rating: "down",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects feedback for user messages", async () => {
    const { service, db } = createService();
    db.queryOne.mockResolvedValueOnce({ id: "msg-1", role: "user" });

    await expect(
      (service as any).updateMessageFeedback({
        messageId: "msg-1",
        tenantId: "tenant-1",
        userId: "user-1",
        rating: "up",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("QaService no-result suggestions", () => {
  it("builds actionable rewrite suggestions from the original and retrieval query", () => {
    const { service } = createService();

    const suggestions = (service as any).buildNoResultSuggestions(
      "pricing automation CRM",
      "pricing automation CRM contract",
    );

    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(new Set(suggestions).size).toBe(suggestions.length);
    expect(suggestions.join(" ").toLowerCase()).toContain("pricing");
    expect(suggestions).not.toContain("pricing automation CRM");
  });

  it("emits suggestions with the no-results callback before completing the stream", async () => {
    const { service, prisma, ragFacts } = createService();
    const onNoResults = vi.fn();
    const onDone = vi.fn();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "pricing automation CRM",
      onChunk: vi.fn(),
      onCitations: vi.fn(),
      onNoResults,
      onDone,
      onError: vi.fn(),
    } as any);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onNoResults).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("pricing")]),
    );
    expect(onDone).toHaveBeenCalledWith(expect.any(String), "conv-1");
    expect(prisma.qAMessage.create).toHaveBeenCalledTimes(2);
    expect(ragFacts.logQaRun).toHaveBeenCalledWith(
      expect.objectContaining({ question: "pricing automation CRM", answer: "" }),
    );
  });
});
