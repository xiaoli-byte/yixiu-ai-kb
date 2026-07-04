import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { GraphService } from "./graph.service";
import { DatabaseService } from "../../database/database.service";

@UseGuards(AuthGuard("jwt"))
@Controller("graph")
export class GraphController {
  constructor(
    private readonly graph: GraphService,
    private readonly db: DatabaseService,
  ) {}

  @Get("explore")
  async explore(
    @Query("keyword") keyword?: string,
    @Query("nodeType") nodeType: "all" | "Document" | "Entity" | "Tag" = "all",
    @Query("categoryId") categoryId?: string,
    @Query("createdFrom") createdFrom?: string,
    @Query("createdTo") createdTo?: string,
    @Query("limit") limit = "80",
    @Query("depth") depth = "2",
  ) {
    return this.graph.explore({
      keyword,
      nodeType,
      categoryId,
      createdFrom,
      createdTo,
      limit: Number(limit) || 80,
      depth: Number(depth) || 2,
    });
  }

  @Get("search")
  async search(
    @Query("keyword") keyword: string,
    @Query("type") type: "Entity" | "Tag" | "Document" = "Entity",
    @Query("limit") limit = "20",
    @Query("depth") depth = "2",
  ) {
    if (!keyword) return { nodes: [], edges: [] };
    return this.graph.searchAndExpand({
      keyword,
      type,
      limit: Number(limit) || 20,
      depth: Number(depth) || 2,
    });
  }

  @Get("top")
  async top(@Query("limit") limit = "50") {
    const tenantId = this.db.tenantId!;
    return this.graph.listTopEntities(tenantId, parseInt(limit, 10) || 50);
  }

  @Get("document/:id")
  async documentEntities(@Param("id") id: string) {
    return this.graph.documentEntities(id);
  }
}
