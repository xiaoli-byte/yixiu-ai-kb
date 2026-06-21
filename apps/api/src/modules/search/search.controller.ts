import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SearchQuery } from "@ai-knowledge/schemas";
import { SearchService } from "./search.service";
import { RateLimit, RateLimitPolicies } from "../../common/rate-limit/rate-limit.guard";

@UseGuards(AuthGuard("jwt"))
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Post()
  @RateLimit({ ...RateLimitPolicies.search, message: "搜索请求过于频繁，请稍后再试" })
  async handleSearch(@Body() raw: unknown) {
    const parsed = SearchQuery.safeParse(raw ?? {});
    if (!parsed.success) {
      return { query: "", mode: "hybrid", total: 0, hits: [], took: 0, error: "invalid_query" };
    }
    const { q, mode, topK, tags } = parsed.data;
    const { hits, took, hasRelevantResults } = await this.search.search({ q, mode, topK, tags });
    return { query: q, mode, total: hits.length, hits, took, hasRelevantResults };
  }
}
