import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { SearchQuery } from "@ai-knowledge/schemas";
import { SearchService } from "./search.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ServiceAuthGuard } from "@xiaoli-byte/authz";

/**
 * 服务间检索端点 POST /api/search/retrieve。
 *
 * **为何独立于 SearchController**：SearchController 类级挂了 `@UseGuards(AuthGuard("jwt"))`，
 * 该类级守卫对其所有方法生效且与方法级守卫**叠加**（NestJS 不覆盖）。若 retrieve 留在
 * SearchController，无 JWT 的服务调用（ai-call 只带 X-Service-Token）会被类级 JWT 守卫先
 * 挡成 401——CALL-06 的运行时链路因此不通。故把 retrieve 拆出，仅挂 ServiceAuthGuard。
 *
 * ServiceAuthGuard：校验 X-Service-Token（环境变量 SERVICE_API_TOKEN），并从
 * X-Tenant-Id / X-User-Id 注入身份到 CLS 与 request.user，供租户隔离 + ACL 过滤。
 */
@Controller("search")
export class SearchRetrieveController {
  constructor(private readonly search: SearchService) {}

  @Post("retrieve")
  @UseGuards(ServiceAuthGuard)
  async retrieve(@Body() raw: unknown, @CurrentUser() user: any) {
    const parsed = SearchQuery.safeParse(raw ?? {});
    if (!parsed.success) {
      return { query: "", mode: "hybrid", sortBy: "relevance", total: 0, hits: [], took: 0, error: "invalid_query" };
    }
    const { q, mode, sortBy, topK, knowledgeBaseId } = parsed.data;

    // knowledgeBaseId（ai-call 的知识库 id）映射到 folder 维度做按库过滤；无效或跨租户 id
    // 返回空结果，绝不扩大为租户级全库检索。
    const { hits, took, hasRelevantResults, truncated = false } = await this.search.search({
      q,
      mode,
      sortBy,
      topK,
      user,
      filters: knowledgeBaseId ? { knowledgeBaseId } : undefined,
    });

    // 服务调用不记录搜索历史，避免污染用户的搜索历史
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
