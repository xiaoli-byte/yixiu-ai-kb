import {
  getOverviewMetrics,
  getOverviewTrend,
  getOverviewCategories,
  getOverviewRecentActivities,
} from "@/lib/api/endpoints/overview";

export type {
  OverviewMetrics,
  OverviewTrendPoint,
  OverviewTrendRange,
  OverviewCategory,
  OverviewActivity,
  OverviewActivityType,
} from "@/lib/api/endpoints/overview";

export const metrics = getOverviewMetrics;
export const trend = getOverviewTrend;
export const categories = getOverviewCategories;
export const recentActivities = getOverviewRecentActivities;

const overviewApi = { metrics, trend, categories, recentActivities };
export default overviewApi;
