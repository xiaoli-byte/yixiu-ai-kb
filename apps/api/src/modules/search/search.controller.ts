import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SearchEventRequest, SearchQuery } from "@ai-knowledge/schemas";
import { SearchService } from "./search.service";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@UseGuards(AuthGuard("jwt"))
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RateLimit({ ...RateLimitPolicies.search, message: "搜索请求过于频繁，请稍后再试" })
  async getSearch(@Query() query: unknown, @CurrentUser() user: any) {
    return this.search.searchList(query, user);
  }

  @Get("hot")
  async hot(@Query() query: unknown) {
    return this.search.listHotSearch(query);
  }

  @Get("history")
  async history(
    @CurrentUser("sub") userId: string,
    @Query("limit") limit?: string,
  ) {
    return this.search.listHistory({
      userId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Delete("history/:id")
  async deleteHistory(@Param("id") id: string, @CurrentUser("sub") userId: string) {
    return this.search.deleteHistory(id, { userId });
  }

  @Delete("history")
  async clearHistory(@CurrentUser("sub") userId: string) {
    return this.search.clearHistory({ userId });
  }

  @Post("history/clear")
  async clearHistoryWithPost(@CurrentUser("sub") userId: string) {
    return this.search.clearHistory({ userId });
  }

  @Post("events")
  async recordEvent(@Body() raw: unknown, @CurrentUser() user: any) {
    const parsed = SearchEventRequest.safeParse(raw ?? {});
    if (!parsed.success) return { recorded: false, error: "invalid_event" };
    const event = parsed.data;
    const userId = user?.sub ?? user?.userId ?? user?.id;
    await this.search.recordSearchEvent({
      keyword: event.keyword ?? event.q,
      eventType: event.eventType,
      resultCount: event.resultCount,
      categoryId: event.categoryId ?? null,
      documentId: event.documentId ?? null,
      contentId: event.contentId ?? null,
      chunkId: event.chunkId ?? null,
      tenantId: user?.tenantId,
      userId,
    });
    return { recorded: true };
  }

  @Post()
  @RateLimit({ ...RateLimitPolicies.search, message: "搜索请求过于频繁，请稍后再试" })
  async handleSearch(@Body() raw: unknown, @CurrentUser() user: any) {
    const parsed = SearchQuery.safeParse(raw ?? {});
    if (!parsed.success) {
      return { query: "", mode: "hybrid", sortBy: "relevance", total: 0, hits: [], took: 0, error: "invalid_query" };
    }
    const { q, mode, sortBy, topK } = parsed.data;
    const { hits, took, hasRelevantResults } = await this.search.search({ q, mode, sortBy, topK, user });
    const userId = user?.sub ?? user?.userId ?? user?.id;
    await this.search.recordHistory({
      q,
      mode,
      sortBy,
      topK,
      resultCount: hits.length,
      tenantId: user?.tenantId,
      userId,
    });
    await this.search.recordSearchEvent({
      keyword: q,
      eventType: "SEARCH",
      resultCount: hits.length,
      tenantId: user?.tenantId,
      userId,
    });
    return { query: q, mode, sortBy, total: hits.length, hits, took, hasRelevantResults };
  }
}
