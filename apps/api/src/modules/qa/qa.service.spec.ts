import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { QaService } from "./qa.service";
import type { RagRoute } from "../rag/rag.types";
import type { SearchHit } from "../search/search.service";

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
  const access = {
    getAccessFlags: vi.fn().mockResolvedValue({}),
    assertDocumentAccess: vi.fn().mockResolvedValue(undefined),
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
      access as any,
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
    storage,
    access,
    ragRouter,
    ragFacts,
    ragTools,
    ragExtractor,
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

describe("QaService recall permission filtering", () => {
  it("filters inaccessible and AI-disabled documents before context, facts, citations, and run chunks", async () => {
    const { service, prisma, db, search, access, llm, ragRouter, ragFacts } = createService();
    const route = createRoute("pricing automation CRM");
    route.requiresFacts = true;
    route.profile.factEntityTypes = ["project"];
    ragRouter.route.mockReturnValueOnce(route);
    const allowed = createHit({
      chunkId: "chunk-allowed",
      documentId: "doc-allowed",
      contentId: "content-allowed",
      documentTitle: "Allowed Handbook",
      text: "allowed chunk text",
    });
    const aiDisabled = createHit({
      chunkId: "chunk-ai-disabled",
      documentId: "doc-ai-disabled",
      contentId: "content-ai-disabled",
      documentTitle: "AI Disabled Handbook",
      text: "ai disabled chunk text",
    });
    const denied = createHit({
      chunkId: "chunk-denied",
      documentId: "doc-denied",
      contentId: "content-denied",
      documentTitle: "Denied Handbook",
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
    const onCitations = vi.fn();
    const onNoResults = vi.fn();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      user: { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
      question: "pricing automation CRM",
      topK: 5,
      onChunk: vi.fn(),
      onCitations,
      onNoResults,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-1", tenantId: "tenant-1" },
      select: { role: true, departmentId: true },
    });
    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          userId: "user-1",
          tenantId: "tenant-1",
          role: "viewer",
          departmentId: "dept-1",
        }),
      }),
    );
    expect(access.getAccessFlags).toHaveBeenCalledWith(
      ["doc-allowed", "doc-ai-disabled", "doc-denied"],
      expect.objectContaining({
        userId: "user-1",
        tenantId: "tenant-1",
        role: "viewer",
        departmentId: "dept-1",
      }),
    );
    expect(ragFacts.findFacts).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-allowed"] }),
    );
    const messages = llm.streamChat.mock.calls[0][0] as Array<{ content: string }>;
    const prompt = messages.map((message) => message.content).join("\n");
    expect(prompt).toContain("allowed chunk text");
    expect(prompt).not.toContain("ai disabled chunk text");
    expect(prompt).not.toContain("denied chunk text");
    expect(onCitations).toHaveBeenCalledWith([
      expect.objectContaining({
        documentId: "doc-allowed",
        contentId: "content-allowed",
        snippet: "allowed chunk text",
      }),
    ]);
    expect(onNoResults).not.toHaveBeenCalled();
    expect(ragFacts.logQaRun).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: [expect.objectContaining({ documentId: "doc-allowed" })],
      }),
    );
  });

  it("over-fetches before filtering so later accessible AI-enabled hits can be used", async () => {
    const { service, db, search, access, llm } = createService();
    const aiDisabled = createHit({
      chunkId: "chunk-ai-disabled",
      documentId: "doc-ai-disabled",
      text: "ai disabled first hit",
    });
    const denied = createHit({
      chunkId: "chunk-denied",
      documentId: "doc-denied",
      text: "denied second hit",
    });
    const laterAllowed = createHit({
      chunkId: "chunk-later-allowed",
      documentId: "doc-later-allowed",
      contentId: "content-later-allowed",
      documentTitle: "Later Allowed Handbook",
      text: "later allowed chunk text",
    });
    search.search.mockResolvedValueOnce({
      hits: [aiDisabled, denied, laterAllowed],
      took: 1,
      hasRelevantResults: true,
    });
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-ai-disabled": accessFlags(true),
      "doc-denied": accessFlags(false),
      "doc-later-allowed": accessFlags(true),
    });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("ai_reference_enabled")) {
        return [
          { id: "doc-ai-disabled", aiReferenceEnabled: false },
          { id: "doc-denied", aiReferenceEnabled: true },
          { id: "doc-later-allowed", aiReferenceEnabled: true },
        ];
      }
      return [];
    });
    const onCitations = vi.fn();
    const onNoResults = vi.fn();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "pricing automation CRM",
      topK: 2,
      onChunk: vi.fn(),
      onCitations,
      onNoResults,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({ topK: expect.any(Number) }),
    );
    expect(search.search.mock.calls[0][0].topK).toBeGreaterThan(2);
    expect(onNoResults).not.toHaveBeenCalled();
    expect(onCitations).toHaveBeenCalledWith([
      expect.objectContaining({
        documentId: "doc-later-allowed",
        snippet: "later allowed chunk text",
      }),
    ]);
    const messages = llm.streamChat.mock.calls[0][0] as Array<{ content: string }>;
    const prompt = messages.map((message) => message.content).join("\n");
    expect(prompt).toContain("later allowed chunk text");
    expect(prompt).not.toContain("ai disabled first hit");
    expect(prompt).not.toContain("denied second hit");
  });

  it("treats recall as no-results and emits no citations when every hit is filtered out", async () => {
    const { service, db, search, access, llm, ragRouter, ragFacts } = createService();
    const route = createRoute("pricing automation CRM");
    route.requiresFacts = true;
    route.profile.factEntityTypes = ["project"];
    ragRouter.route.mockReturnValueOnce(route);
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
      hits: [aiDisabled, denied],
      took: 1,
      hasRelevantResults: true,
    });
    access.getAccessFlags.mockResolvedValueOnce({
      "doc-ai-disabled": accessFlags(true),
      "doc-denied": accessFlags(false),
    });
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes("ai_reference_enabled")) {
        return [
          { id: "doc-ai-disabled", aiReferenceEnabled: false },
          { id: "doc-denied", aiReferenceEnabled: true },
        ];
      }
      return [];
    });
    const onCitations = vi.fn();
    const onNoResults = vi.fn();

    await service.ask({
      userId: "user-1",
      tenantId: "tenant-1",
      question: "pricing automation CRM",
      onChunk: vi.fn(),
      onCitations,
      onNoResults,
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onNoResults).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("pricing")]),
    );
    expect(onCitations).not.toHaveBeenCalled();
    const messages = llm.streamChat.mock.calls[0][0] as Array<{ content: string }>;
    const prompt = messages.map((message) => message.content).join("\n");
    expect(prompt).not.toContain("ai disabled chunk text");
    expect(prompt).not.toContain("denied chunk text");
    expect(ragFacts.findFacts).not.toHaveBeenCalled();
    expect(ragFacts.logQaRun).toHaveBeenCalledWith(expect.objectContaining({ chunks: [] }));
  });
});

describe("QaService document route access", () => {
  it("requires VIEW access on the resolved canonical document before returning a document URL", async () => {
    const { service, prisma, db, access } = createService();
    prisma.document.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "doc-canonical",
        tenantId: "tenant-1",
        title: "Canonical.pdf",
        mime: "application/pdf",
        storageKey: "objects/canonical.pdf",
      });
    db.queryOne.mockResolvedValueOnce({ canonical_document_id: "doc-canonical" });

    await service.getDocumentPresignedUrl(
      "content-1",
      "tenant-1",
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.document.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: "content-1", tenantId: "tenant-1", deletedAt: null },
    });
    expect(prisma.document.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: "doc-canonical", tenantId: "tenant-1", deletedAt: null },
    });
    expect(access.assertDocumentAccess).toHaveBeenCalledWith(
      "doc-canonical",
      "VIEW",
      expect.objectContaining({
        userId: "user-1",
        tenantId: "tenant-1",
        role: "viewer",
        departmentId: "dept-1",
      }),
    );
  });

  it("requires VIEW access on canonical markdown content before reading it", async () => {
    const { service, prisma, db, storage, access } = createService();
    prisma.document.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "doc-md",
        tenantId: "tenant-1",
        title: "Notes.md",
        mime: "text/markdown",
        storageKey: "objects/notes.md",
      });
    db.queryOne.mockResolvedValueOnce({ canonical_document_id: "doc-md" });
    storage.getObject.mockResolvedValueOnce(Buffer.from("# Notes"));

    await service.getDocumentMarkdown(
      "content-md",
      "tenant-1",
      { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
    );

    expect(access.assertDocumentAccess).toHaveBeenCalledWith(
      "doc-md",
      "VIEW",
      expect.objectContaining({ userId: "user-1", tenantId: "tenant-1" }),
    );
    expect(storage.getObject).toHaveBeenCalledWith("objects/notes.md");
  });

  it("requires DOWNLOAD access on canonical file content before opening the stream", async () => {
    const { service, prisma, db, storage, access } = createService();
    prisma.document.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "doc-file",
        tenantId: "tenant-1",
        title: "Report.pdf",
        mime: "application/pdf",
        storageKey: "objects/report.pdf",
      });
    db.queryOne.mockResolvedValueOnce({ canonical_document_id: "doc-file" });
    access.assertDocumentAccess.mockRejectedValueOnce(new ForbiddenException("denied"));

    await expect(
      service.getDocumentFile(
        "content-file",
        "tenant-1",
        { sub: "user-1", tenantId: "tenant-1", role: "viewer" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(access.assertDocumentAccess).toHaveBeenCalledWith(
      "doc-file",
      "DOWNLOAD",
      expect.objectContaining({ userId: "user-1", tenantId: "tenant-1" }),
    );
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });
});
