import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { AskRequest } from "@ai-knowledge/schemas";
import { QaService } from "./qa.service";
import { DatabaseService } from "../../database/database.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AnyAuthenticated } from "../../common/permissions/permissions.guard";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import type { Response } from "express";

function buildContentDisposition(title: string, disposition: "inline" | "attachment") {
  const fallbackTitle = title
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\/]/g, "_") || "document";
  const encodedTitle = encodeURIComponent(title).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${fallbackTitle}"; filename*=UTF-8''${encodedTitle}`;
}

@Controller("qa")
export class QaController {
  constructor(
    private readonly qa: QaService,
    private readonly db: DatabaseService,
  ) {}

  @Get("conversations")
  @AnyAuthenticated()
  async list(@CurrentUser("sub") userId: string) {
    const tenantId = this.db.tenantId!;
    const items = await this.qa.listConversations(userId, tenantId);
    return items.map((c: typeof items[number]) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messageCount: (c as any)._count?.messages || 0,
    }));
  }

  @Get("conversations/:id")
  @AnyAuthenticated()
  async get(@Param("id") id: string, @CurrentUser() user: any) {
    const userId = user?.sub ?? user?.userId ?? user?.id;
    return this.qa.getConversation(id, userId, this.db.tenantId!, user);
  }

  @Patch("messages/:id/feedback")
  @AnyAuthenticated()
  async updateMessageFeedback(
    @Param("id") id: string,
    @Body() body: { rating?: string; feedbackText?: string | null },
    @CurrentUser("sub") userId: string,
  ) {
    return this.qa.updateMessageFeedback({
      messageId: id,
      tenantId: this.db.tenantId!,
      userId,
      rating: body.rating || "none",
      feedbackText: body.feedbackText,
    });
  }

  @Get("debug/runs")
  @AnyAuthenticated()
  async listDebugRuns(
    @CurrentUser("sub") userId: string,
    @Query("conversationId") conversationId?: string,
    @Query("limit") limit?: string,
  ) {
    const tenantId = this.db.tenantId!;
    return this.qa.listDebugRuns(tenantId, userId, {
      conversationId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("documents/:id/file")
  @AnyAuthenticated()
  async getDocumentFile(
    @Param("id") id: string,
    @CurrentUser() user: any,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ) {
    const tenantId = this.db.tenantId!;
    const disposition = download === "1" ? "attachment" : "inline";
    const file = await this.qa.getDocumentFile(
      id,
      tenantId,
      user,
      disposition === "attachment" ? "DOWNLOAD" : "VIEW",
    );

    res.setHeader("Content-Type", file.mime);
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition(file.title, disposition),
    );
    res.setHeader("Cache-Control", "private, no-store");

    file.stream.on("error", () => {
      if (!res.headersSent) {
        res.status(500).end();
        return;
      }
      res.destroy();
    });
    file.stream.pipe(res);
  }

  @Get("documents/:id/markdown")
  @AnyAuthenticated()
  async getDocumentMarkdown(
    @Param("id") id: string,
    @CurrentUser() user: any,
  ) {
    const tenantId = this.db.tenantId!;
    return this.qa.getDocumentMarkdown(id, tenantId, user);
  }

  // 解析文本（切片拼接）：Office 在线预览 / 图片 OCR / 音频转写文本
  @Get("documents/:id/content")
  @AnyAuthenticated()
  async getDocumentContent(
    @Param("id") id: string,
    @CurrentUser() user: any,
  ) {
    const tenantId = this.db.tenantId!;
    return this.qa.getDocumentParsedText(id, tenantId, user);
  }

  @Delete("conversations/:id")
  @AnyAuthenticated()
  async delete(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.qa.deleteConversation(id, userId, this.db.tenantId!);
  }

  @Post("ask")
  @AnyAuthenticated()
  @RateLimit({ ...RateLimitPolicies.qa, message: "AI 问答请求过于频繁，请稍后再试" })
  async ask(
    @Body() body: unknown,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const userId = user?.sub ?? user?.userId ?? user?.id;
    // 请求校验：question 1-2000、topK 默认 5 上限 20（沿用手写 400 的响应方式）
    const parsed = AskRequest.safeParse(body);
    if (!parsed.success) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ message: "请求参数不合法" }));
      return;
    }
    const { conversationId, question, topK } = parsed.data;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "none");
    res.flushHeaders?.();

    // 客户端断开时中止生成：将 abort 信号透传给 qa.ask -> llm.streamChat
    const abort = new AbortController();
    let closed = false;
    res.on("close", () => {
      closed = true;
      abort.abort();
    });

    const write = (event: any) => {
      if (closed || res.destroyed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const end = () => {
      if (closed || res.destroyed || res.writableEnded) return;
      closed = true;
      res.end();
    };

    await this.qa.ask({
      userId,
      tenantId: this.db.tenantId!,
      user,
      conversationId,
      question,
      topK,
      signal: abort.signal,
      // 会话确保存在、生成开始前的早发事件，前端据此拿到 conversationId
      onConversation: (conversation) => write({ type: "conversation", conversationId: conversation }),
      onChunk: (content) => write({ type: "chunk", content }),
      // citations 在 LLM 完成后由 service 调用，此时才发往前端
      onCitations: (citations) => write({ type: "citations", citations }),
      // 无检索结果时通知前端，前端显示提示但不中断流程
      onNoResults: (suggestions) => write({ type: "no_results", suggestions }),
      onDone: (messageId, conversation) => {
        write({ type: "done", messageId, conversationId: conversation });
        end();
      },
      // 仅向客户端发送通用文案；原始 error 已在 qa.service 记入 logger/runLog
      onError: () => {
        write({ type: "error", message: "生成失败，请稍后重试" });
        end();
      },
    });
  }
}
