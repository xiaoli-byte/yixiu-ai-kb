import { apiClient } from "../client";

export type OverviewTrendRange = "today" | "week" | "month";
export type OverviewActivityType = "upload" | "update" | "delete" | "qa";

export interface OverviewMetrics {
  documentTotal: number;
  documentToday: number;
  documentYesterday: number;
  qaTotal: number;
  qaToday: number;
  qaYesterday: number;
  searchTotal: number;
  searchToday: number;
  searchYesterday: number;
  /** 近 7 天活跃用户（搜索/问答去重，代理指标） */
  activeUsers7d: number;
}

export interface OverviewTrendPoint {
  label: string;
  value: number;
}

export interface OverviewCategory {
  name: string;
  value: number;
}

export interface OverviewActivity {
  time: string;
  actor: string | null;
  type: OverviewActivityType;
  title: string;
  relatedId: string | null;
}

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  return apiClient.get<OverviewMetrics>("/overview/metrics");
}

export async function getOverviewTrend(range: OverviewTrendRange): Promise<OverviewTrendPoint[]> {
  return apiClient.get<OverviewTrendPoint[]>(`/overview/trend?range=${range}`);
}

export async function getOverviewCategories(): Promise<OverviewCategory[]> {
  return apiClient.get<OverviewCategory[]>("/overview/categories");
}

export async function getOverviewRecentActivities(limit = 8): Promise<OverviewActivity[]> {
  return apiClient.get<OverviewActivity[]>(`/overview/recent-activities?limit=${limit}`);
}
