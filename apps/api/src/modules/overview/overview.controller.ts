import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PermissionsGuard } from "../../common/permissions/permissions.guard";
import { DatabaseService } from "../../database/database.service";
import {
  OverviewService,
  type OverviewTrendRange,
} from "./overview.service";

const TREND_RANGES: OverviewTrendRange[] = ["today", "week", "month"];

// 概览统计：租户级聚合，所有登录用户可见（不加 @AdminOnly）
@UseGuards(AuthGuard("jwt"), PermissionsGuard)
@Controller("overview")
export class OverviewController {
  constructor(
    private readonly overview: OverviewService,
    private readonly db: DatabaseService,
  ) {}

  @Get("metrics")
  async metrics() {
    return this.overview.getMetrics(this.db.tenantId!);
  }

  @Get("trend")
  async trend(@Query("range") range?: string) {
    const normalized: OverviewTrendRange = TREND_RANGES.includes(range as OverviewTrendRange)
      ? (range as OverviewTrendRange)
      : "today";
    return this.overview.getTrend(this.db.tenantId!, normalized);
  }

  @Get("categories")
  async categories() {
    return this.overview.getCategories(this.db.tenantId!);
  }

  @Get("recent-activities")
  async recentActivities(@Query("limit") limit?: string) {
    const parsed = Number(limit);
    return this.overview.getRecentActivities(
      this.db.tenantId!,
      Number.isFinite(parsed) ? parsed : 8,
    );
  }
}
