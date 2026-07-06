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
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { QaService } from "./qa.service";
import { DatabaseService } from "../../database/database.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import type { Response } from "express";

@UseGuards(AuthGuard("jwt"))
@Controller("qa")
export class QaController {
  constructor(
    private readonly qa: QaService,
    private readonly db: DatabaseService,
  ) {}

  @Get("conversations")
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
  async get(@Param("id") id: string, @CurrentUser("sub") userId: string) {
    return this.qa.getConversation(id, userId, this.db.tenantId!);
  }

  @Patch("messages/:id/feedback")
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

  @Get("chunks/:id")
  async getChunk(@Param("id") id: string) {
    return this.qa.getChunk(id);
  }

  @Get("debug/runs")
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

  @Get("documents/:id/pdf-url")
  async getDocumentUrl(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    const tenantId = this.db.tenantId!;
    return this.qa.getDocumentPresignedUrl(id, tenantId, userId);
  }

  @Get("documents/:id/file")
  async getDocumentFile(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const tenantId = this.db.tenantId!;
    const file = await this.qa.getDocumentFile(id, tenantId);
    const encodedTitle = encodeURIComponent(file.title);

    res.setHeader("Content-Type", file.mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodedTitle}"; filename*=UTF-8''${encodedTitle}`,
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
  async getDocumentMarkdown(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    const tenantId = this.db.tenantId!;
    return this.qa.getDocumentMarkdown(id, tenantId);
  }

  @Delete("conversations/:id")
  async delete(
    @Param("id") id: string,
    @CurrentUser("sub") userId: string,
  ) {
    return this.qa.deleteConversation(id, userId);
  }

  @Post("ask")
  @RateLimit({ ...RateLimitPolicies.qa, message: "AI 问答请求过于频繁，请稍后再试" })
  async ask(
    @Body() body: { conversationId?: string; question: string; topK?: number },
    @CurrentUser("sub") userId: string,
    @Res() res: Response,
  ) {
    const question = (body.question || "").trim();
    if (!question) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 400;
      res.end(JSON.stringify({ message: "question 不能为空" }));
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "none");
    res.flushHeaders?.();

    let closed = false;
    res.on("close", () => {
      closed = true;
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
      conversationId: body.conversationId,
      question,
      topK: body.topK,
      onChunk: (content) => write({ type: "chunk", content }),
      // citations 在 LLM 完成后由 service 调用，此时才发往前端
      onCitations: (citations) => write({ type: "citations", citations }),
      // 无检索结果时通知前端，前端显示提示但不中断流程
      onNoResults: (suggestions) => write({ type: "no_results", suggestions }),
      onDone: (messageId, conversationId) => {
        write({ type: "done", messageId, conversationId });
        end();
      },
      onError: (e) => {
        write({ type: "error", message: e.message });
        end();
      },
    });
  }
}
