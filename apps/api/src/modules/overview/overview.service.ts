import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";

export type OverviewTrendRange = "today" | "week" | "month";

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
  /** 近 7 天活跃用户（搜索/问答事件去重，代理指标，非精确在线） */
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

export type OverviewActivityType = "upload" | "update" | "delete" | "qa";

export interface OverviewActivity {
  time: string;
  actor: string | null;
  type: OverviewActivityType;
  title: string;
  relatedId: string | null;
}

// 三段计数：总数 / 今日 / 昨日（今日=当天 0 点起，昨日=前一天整日）
const COUNT_BUCKETS = `
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
  COUNT(*) FILTER (
    WHERE created_at >= date_trunc('day', now()) - interval '1 day'
      AND created_at < date_trunc('day', now())
  )::int AS yesterday
`;

@Injectable()
export class OverviewService {
  constructor(private readonly db: DatabaseService) {}

  async getMetrics(tenantId: string): Promise<OverviewMetrics> {
    const [docs, qa, search, active] = await Promise.all([
      this.db.queryOne<{ total: number; today: number; yesterday: number }>(
        `SELECT ${COUNT_BUCKETS} FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),
      this.db.queryOne<{ total: number; today: number; yesterday: number }>(
        `SELECT ${COUNT_BUCKETS} FROM qa_run_logs WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.queryOne<{ total: number; today: number; yesterday: number }>(
        `SELECT ${COUNT_BUCKETS} FROM search_events WHERE tenant_id = $1 AND event_type = 'SEARCH'`,
        [tenantId],
      ),
      this.db.queryOne<{ active: number }>(
        `SELECT COUNT(DISTINCT user_id)::int AS active FROM (
           SELECT user_id, created_at FROM search_events WHERE tenant_id = $1 AND user_id IS NOT NULL
           UNION ALL
           SELECT user_id, created_at FROM qa_run_logs WHERE tenant_id = $1 AND user_id IS NOT NULL
         ) e
         WHERE created_at >= now() - interval '7 days'`,
        [tenantId],
      ),
    ]);

    return {
      documentTotal: docs?.total ?? 0,
      documentToday: docs?.today ?? 0,
      documentYesterday: docs?.yesterday ?? 0,
      qaTotal: qa?.total ?? 0,
      qaToday: qa?.today ?? 0,
      qaYesterday: qa?.yesterday ?? 0,
      searchTotal: search?.total ?? 0,
      searchToday: search?.today ?? 0,
      searchYesterday: search?.yesterday ?? 0,
      activeUsers7d: active?.active ?? 0,
    };
  }

  async getTrend(tenantId: string, range: OverviewTrendRange): Promise<OverviewTrendPoint[]> {
    if (range === "today") {
      // 今日按小时分桶（0 点到当前小时），generate_series 保证稠密
      const rows = await this.db.query<{ label: string; value: number }>(
        `WITH hours AS (
           SELECT generate_series(date_trunc('day', now()), date_trunc('hour', now()), interval '1 hour') AS bucket
         )
         SELECT to_char(h.bucket, 'HH24:00') AS label, COALESCE(COUNT(se.id), 0)::int AS value
         FROM hours h
         LEFT JOIN search_events se
           ON se.tenant_id = $1 AND date_trunc('hour', se.created_at) = h.bucket
         GROUP BY h.bucket
         ORDER BY h.bucket`,
        [tenantId],
      );
      return rows;
    }

    // week=近 7 天，month=近 30 天，按天分桶
    const days = range === "week" ? 7 : 30;
    const rows = await this.db.query<{ label: string; value: number }>(
      `WITH days AS (
         SELECT generate_series(
           date_trunc('day', now()) - make_interval(days => $2::int - 1),
           date_trunc('day', now()),
           interval '1 day'
         ) AS bucket
       )
       SELECT to_char(d.bucket, 'MM-DD') AS label, COALESCE(COUNT(se.id), 0)::int AS value
       FROM days d
       LEFT JOIN search_events se
         ON se.tenant_id = $1 AND date_trunc('day', se.created_at) = d.bucket
       GROUP BY d.bucket
       ORDER BY d.bucket`,
      [tenantId, days],
    );
    return rows;
  }

  async getCategories(tenantId: string): Promise<OverviewCategory[]> {
    // 文档表无 category 字段，按所属文件夹分组；未分文件夹归“未分类”
    return this.db.query<OverviewCategory>(
      `SELECT COALESCE(f.name, '未分类') AS name, COUNT(*)::int AS value
       FROM documents d
       LEFT JOIN folders f ON f.id = d.folder_id AND f.tenant_id = $1
       WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
       GROUP BY COALESCE(f.name, '未分类')
       ORDER BY value DESC
       LIMIT 8`,
      [tenantId],
    );
  }

  async getRecentActivities(tenantId: string, limit = 8): Promise<OverviewActivity[]> {
    // 由真实记录派生，不编造：文档的上传/更新/删除 + 问答事件，按时间倒序
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const rows = await this.db.query<{
      time: string;
      actor: string | null;
      type: OverviewActivityType;
      title: string;
      related_id: string | null;
    }>(
      `SELECT time, actor, type, title, related_id FROM (
         SELECT
           COALESCE(d.deleted_at, d.updated_at, d.created_at) AS time,
           u.name AS actor,
           CASE
             WHEN d.deleted_at IS NOT NULL THEN 'delete'
             WHEN d.updated_at > d.created_at + interval '2 seconds' THEN 'update'
             ELSE 'upload'
           END AS type,
           d.title AS title,
           d.id AS related_id
         FROM documents d
         LEFT JOIN users u ON u.id = COALESCE(d.deleted_by, d.owner_id)
         WHERE d.tenant_id = $1
         UNION ALL
         SELECT
           q.created_at AS time,
           u.name AS actor,
           'qa' AS type,
           q.question AS title,
           q.conversation_id AS related_id
         FROM qa_run_logs q
         LEFT JOIN users u ON u.id = q.user_id
         WHERE q.tenant_id = $1
       ) act
       ORDER BY time DESC
       LIMIT $2`,
      [tenantId, safeLimit],
    );

    return rows.map((row) => ({
      time: typeof row.time === "string" ? row.time : new Date(row.time).toISOString(),
      actor: row.actor,
      type: row.type,
      title: row.title,
      relatedId: row.related_id,
    }));
  }
}
