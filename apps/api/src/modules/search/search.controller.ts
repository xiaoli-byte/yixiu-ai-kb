import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SearchEventRequest, SearchQuery } from "@ai-knowledge/schemas";
import { SearchService } from "./search.service";
import { AnyAuthenticated } from "../../common/permissions/permissions.guard";
import { RateLimit, RateLimitGuard, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@UseGuards(RateLimitGuard)
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RateLimit({ ...RateLimitPolicies.search, message: "搜索请求过于频繁，请稍后再试" })
  @AnyAuthenticated()
  async getSearch(@Query() query: unknown, @CurrentUser() user: any) {
    return this.search.searchList(query, user);
  }

  @Get("hot")
  @AnyAuthenticated()
  async hot(@Query() query: unknown) {
    return this.search.listHotSearch(query);
  }

  @Get("history")
  @AnyAuthenticated()
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
  @AnyAuthenticated()
  async deleteHistory(@Param("id") id: string, @CurrentUser("sub") userId: string) {
    return this.search.deleteHistory(id, { userId });
  }

  @Delete("history")
  @AnyAuthenticated()
  async clearHistory(@CurrentUser("sub") userId: string) {
    return this.search.clearHistory({ userId });
  }

  @Post("history/clear")
  @AnyAuthenticated()
  async clearHistoryWithPost(@CurrentUser("sub") userId: string) {
    return this.search.clearHistory({ userId });
  }

  @Post("events")
  @AnyAuthenticated()
  @RateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyPrefix: "search-events",
    message: "Search event requests are too frequent, please try again later",
  })
  async recordEvent(@Body() raw: unknown, @CurrentUser() user: any) {
    const parsed = SearchEventRequest.safeParse(raw ?? {});
    if (!parsed.success) return { recorded: false, error: "invalid_event" };
    const recorded = await this.search.recordResultInteraction(parsed.data, user);
    return recorded ? { recorded: true } : { recorded: false, error: "invalid_event_target" };
  }

  @Post()
  @AnyAuthenticated()
  @RateLimit({ ...RateLimitPolicies.search, message: "搜索请求过于频繁，请稍后再试" })
  async handleSearch(@Body() raw: unknown, @CurrentUser() user: any) {
    const parsed = SearchQuery.safeParse(raw ?? {});
    if (!parsed.success) {
      return { query: "", mode: "hybrid", sortBy: "relevance", total: 0, hits: [], took: 0, error: "invalid_query" };
    }
    const { q, mode, sortBy, topK } = parsed.data;
    const { hits, took, hasRelevantResults, truncated = false } = await this.search.search({ q, mode, sortBy, topK, user });
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
    return {
      query: q,
      mode,
      sortBy,
      total: hits.length,
      hits,
      took,
      hasRelevantResults,
      truncated,
      resultLimit: topK,
    };
  }
}
