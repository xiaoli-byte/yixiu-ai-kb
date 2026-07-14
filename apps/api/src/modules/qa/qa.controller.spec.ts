import { describe, expect, it, vi } from "vitest";
import { QaController } from "./qa.controller";

function createFixture() {
  const stream = {
    on: vi.fn().mockReturnThis(),
    pipe: vi.fn(),
  };
  const qa = {
    getDocumentFile: vi.fn().mockResolvedValue({
      title: "中文资料 (终稿).pdf",
      mime: "application/pdf",
      stream,
    }),
  };
  const db = { tenantId: "tenant-1" };
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    destroy: vi.fn(),
    headersSent: false,
  };
  const controller = new QaController(qa as never, db as never);

  return { controller, db, qa, response, stream };
}

function createAskFixture() {
  const qa = { ask: vi.fn().mockResolvedValue(undefined) };
  const db = { tenantId: "tenant-1" };
  const writes: string[] = [];
  const res = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    on: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: vi.fn(),
    statusCode: 200,
    destroyed: false,
    writableEnded: false,
  };
  const controller = new QaController(qa as never, db as never);
  return { controller, qa, db, res, writes };
}

describe("QaController ask 请求校验", () => {
  it.each([
    ["缺少 question", {}],
    ["纯空白 question", { question: "   " }],
    ["超长 question", { question: "x".repeat(2001) }],
    ["question 非字符串", { question: 123 }],
  ])("%s 时返回 400 JSON 且不调用 qa.ask", async (_label, body) => {
    const { controller, qa, res } = createAskFixture();

    await controller.ask(body, { sub: "user-1" }, res as never);

    expect(res.statusCode).toBe(400);
    expect(qa.ask).not.toHaveBeenCalled();
    const payload = JSON.parse((res.end as any).mock.calls[0][0]);
    expect(payload).toEqual({ message: "请求参数不合法" });
  });

  it("新会话前端显式发送 conversationId: null，必须通过校验并归一为 undefined", async () => {
    const { controller, qa, res } = createAskFixture();

    await controller.ask(
      { conversationId: null, question: "新会话第一问" },
      { sub: "user-1" },
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(qa.ask).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: undefined, question: "新会话第一问" }),
    );
  });
});

describe("QaController ask SSE 流", () => {
  it("合法请求：透传 trim 后 question/默认 topK 与 abort signal，转发 conversation/done 事件", async () => {
    const { controller, qa, res, writes } = createAskFixture();
    qa.ask.mockImplementationOnce(async (opts: any) => {
      opts.onConversation("conv-x");
      opts.onChunk("片段");
      opts.onDone("msg-1", "conv-x");
    });

    await controller.ask({ question: "  你好  " }, { sub: "user-1" }, res as never);

    expect(qa.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tenantId: "tenant-1",
        question: "你好",
        topK: 5,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(writes).toContain(
      `data: ${JSON.stringify({ type: "conversation", conversationId: "conv-x" })}\n\n`,
    );
    expect(writes).toContain(
      `data: ${JSON.stringify({ type: "done", messageId: "msg-1", conversationId: "conv-x" })}\n\n`,
    );
  });

  it("生成失败：仅发送通用文案，不泄露原始错误信息", async () => {
    const { controller, qa, res, writes } = createAskFixture();
    qa.ask.mockImplementationOnce(async (opts: any) => {
      opts.onError(new Error("内部数据库连接细节"));
    });

    await controller.ask({ question: "问题" }, { sub: "user-1" }, res as never);

    expect(writes).toContain(
      `data: ${JSON.stringify({ type: "error", message: "生成失败，请稍后重试" })}\n\n`,
    );
    expect(writes.join("")).not.toContain("内部数据库连接细节");
  });

  it("客户端断开时通过 res close 触发 abort signal", async () => {
    const { controller, qa, res } = createAskFixture();
    let abortedDuringAsk = false;
    let closeHandler: (() => void) | undefined;
    (res.on as any).mockImplementation((event: string, handler: () => void) => {
      if (event === "close") closeHandler = handler;
      return res;
    });
    qa.ask.mockImplementationOnce(async (opts: any) => {
      closeHandler?.(); // 模拟客户端断开
      abortedDuringAsk = opts.signal?.aborted === true;
    });

    await controller.ask({ question: "问题" }, { sub: "user-1" }, res as never);

    expect(abortedDuringAsk).toBe(true);
  });
});

describe("QaController document file response", () => {
  it.each([
    [undefined, "inline"],
    ["0", "inline"],
    ["1", "attachment"],
  ])("uses %s as the download flag for %s disposition", async (download, disposition) => {
    const { controller, db, qa, response, stream } = createFixture();
    const user = { sub: "user-1" };

    await controller.getDocumentFile("document-1", user, download, response as never);

    expect(qa.getDocumentFile).toHaveBeenCalledWith(
      "document-1",
      db.tenantId,
      user,
      disposition === "attachment" ? "DOWNLOAD" : "VIEW",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      `${disposition}; filename="____ (__).pdf"; filename*=UTF-8''%E4%B8%AD%E6%96%87%E8%B5%84%E6%96%99%20%28%E7%BB%88%E7%A8%BF%29.pdf`,
    );
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(stream.pipe).toHaveBeenCalledWith(response);
  });
});
