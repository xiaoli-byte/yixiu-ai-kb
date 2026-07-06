import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { GraphService } from "./graph.service";
import { DatabaseService } from "../../database/database.service";
import {
  PermissionsGuard,
  RequireMinRole,
  RequirePermissions,
} from "../../common/permissions/permissions.guard";
import { Action, Resource, Role } from "../../common/permissions/permissions.types";

class SaveGraphViewDto {
  name!: string;
  description?: string;
  visibility?: "PRIVATE" | "SHARED";
  filters!: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

class MergeEntityDto {
  targetNodeId!: string;
  aliases?: string[];
  reason?: string;
}

class AliasDto {
  aliases!: string[];
  reason?: string;
}

class RelationDto {
  sourceNodeId!: string;
  targetNodeId!: string;
  relationType!: string;
  evidenceText?: string;
  documentContentId?: string;
  documentId?: string;
  chunkId?: string;
  reason?: string;
  reviewStatus?: "APPROVED" | "REJECTED" | "PENDING";
}

class ReviewRelationDto {
  reviewStatus!: "APPROVED" | "REJECTED" | "PENDING";
  reason?: string;
}

@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("graph")
export class GraphController {
  constructor(
    private readonly graph: GraphService,
    private readonly db: DatabaseService,
  ) {}

  @Get("explore")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async explore(
    @Query("keyword") keyword?: string,
    @Query("nodeType") nodeType: "all" | "Document" | "Entity" | "Tag" = "all",
    @Query("documentId") documentId?: string,
    @Query("entityType") entityType?: string,
    @Query("relationType") relationType?: string,
    @Query("categoryId") categoryId?: string,
    @Query("createdFrom") createdFrom?: string,
    @Query("createdTo") createdTo?: string,
    @Query("updatedFrom") updatedFrom?: string,
    @Query("updatedTo") updatedTo?: string,
    @Query("limit") limit = "80",
    @Query("depth") depth = "2",
  ) {
    return this.graph.explore({
      keyword,
      nodeType,
      documentId,
      entityType,
      relationType,
      categoryId,
      createdFrom,
      createdTo,
      updatedFrom,
      updatedTo,
      limit: Number(limit) || 80,
      depth: Number(depth) || 2,
    });
  }

  @Get("search")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
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
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async top(@Query("limit") limit = "50") {
    const tenantId = this.db.tenantId!;
    return this.graph.listTopEntities(tenantId, parseInt(limit, 10) || 50);
  }

  @Get("document/:id")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async documentEntities(@Param("id") id: string) {
    return this.graph.documentEntities(id);
  }

  @Get("edges/:id/evidence")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async edgeEvidence(@Param("id") id: string) {
    return this.graph.edgeEvidence(id);
  }

  @Get("nodes/:id/evidence")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async nodeEvidence(@Param("id") id: string) {
    return this.graph.nodeEvidence(id);
  }

  @Get("path")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async shortestPath(
    @Query("sourceId") sourceId: string,
    @Query("targetId") targetId: string,
    @Query("maxDepth") maxDepth = "3",
  ) {
    return this.graph.shortestPath({
      sourceId,
      targetId,
      maxDepth: Number(maxDepth) || 3,
    });
  }

  @Get("views")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async listViews() {
    return this.graph.listViews();
  }

  @Post("views")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async saveView(@Body() dto: SaveGraphViewDto) {
    return this.graph.saveView(dto);
  }

  @Patch("views/:id")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async updateView(@Param("id") id: string, @Body() dto: Partial<SaveGraphViewDto>) {
    return this.graph.updateView(id, dto);
  }

  @Delete("views/:id")
  @RequirePermissions({ resource: Resource.GRAPH, action: Action.READ })
  async deleteView(@Param("id") id: string) {
    return this.graph.deleteView(id);
  }

  @Post("entities/:id/merge")
  @RequireMinRole(Role.EDITOR)
  async mergeEntity(@Param("id") id: string, @Body() dto: MergeEntityDto) {
    return this.graph.mergeEntity(id, dto);
  }

  @Patch("entities/:id/aliases")
  @RequireMinRole(Role.EDITOR)
  async updateAliases(@Param("id") id: string, @Body() dto: AliasDto) {
    return this.graph.updateAliases(id, dto.aliases || [], dto.reason);
  }

  @Post("relations")
  @RequireMinRole(Role.EDITOR)
  async createRelation(@Body() dto: RelationDto) {
    return this.graph.createRelation(dto);
  }

  @Patch("relations/:id")
  @RequireMinRole(Role.EDITOR)
  async updateRelation(@Param("id") id: string, @Body() dto: Partial<RelationDto>) {
    return this.graph.updateRelation(id, dto);
  }

  @Patch("relations/:id/review")
  @RequireMinRole(Role.EDITOR)
  async reviewRelation(@Param("id") id: string, @Body() dto: ReviewRelationDto) {
    return this.graph.reviewRelation(id, dto.reviewStatus, dto.reason);
  }

  @Delete("relations/:id")
  @RequireMinRole(Role.EDITOR)
  async deleteRelation(@Param("id") id: string, @Query("reason") reason?: string) {
    return this.graph.deleteRelation(id, reason);
  }
}
