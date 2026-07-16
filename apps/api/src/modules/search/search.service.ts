import { Injectable, Logger } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { HotSearchQuery, SearchListQuery } from "@ai-knowledge/schemas";
import type { SearchSortBy } from "@ai-knowledge/schemas";
import { DatabaseService } from "../../database/database.service";
import { EmbeddingsService } from "../embeddings/embeddings.service";
import {
  DocumentAccessService,
  type DocumentAccessFlags,
  type DocumentUserContext,
} from "../documents/document-access.service";
import { AppConfigService } from "../../config/app-config.service";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  contentId?: string;
  documentTitle: string;
  permissionScope?: string;
  canDownload?: boolean;
  categoryPath?: string | null;
  mime: string;          // 文档 MIME 类型
  idx: number;
  text: string;
  highlight: string;
  score: number;
  hotScore?: number;
  viewCount?: number;
  downloadCount?: number;
  sources: Array<"bm25" | "vector" | "trgm">;
  page: number | null;  // PDF 页码（1-based）
  updatedAt?: string | null;
  createdAt?: string | null;
  interactionToken?: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  mode: "hybrid" | "semantic" | "keyword";
  sortBy: SearchSortBy;
  topK: number;
  resultCount: number;
  createdAt: string;
}

export interface HotSearchItem {
  keyword: string;
  hotScore: number;
  searchCount: number;
  clickCount: number;
  viewCount: number;
  downloadCount: number;
  trend: "up" | "down" | "flat";
  categoryId?: string | null;
  pinned: boolean;
}

type SearchModeValue = "hybrid" | "semantic" | "keyword";

type SearchFilters = {
  fileType?: string;
  categoryId?: string;
  permissionScope?: string;
  updateTimeRange?: "all" | "today" | "7d" | "30d" | "custom";
  parseStatus?: string;
  uploaderId?: string;
  departmentId?: string;
  archived?: boolean;
  includeArchived?: boolean;
  // 知识库维度（ai-call → retrieve）：映射到 documents.folder_id。无效或跨租户 id
  // 会使本次检索返回空结果，绝不退化为租户级全库检索。
  knowledgeBaseId?: string;
};

type SearchOptions = {
  q: string;
  mode: SearchModeValue;
  sortBy?: SearchSortBy;
  topK: number;
  maxResults?: number;
  candidateLimit?: number;
  user?: any;
  filters?: SearchFilters;
};

type SearchEventInput = {
  keyword?: string;
  q?: string;
  eventType?: string;
  resultCount?: number;
  tenantId?: string;
  userId?: string | null;
  categoryId?: string | null;
  documentId?: string | null;
  contentId?: string | null;
  chunkId?: string | null;
  interactionToken?: string | null;
};

type SearchInteractionTokenPayload = {
  v: 1;
  tenantId: string;
  userId: string;
  keyword: string;
  documentId: string;
  exp: number;
};

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  /** 向量相似度阈值，低于此值的结果将被过滤 */
  private readonly VECTOR_THRESHOLD = 0.6;

  /** 每个文档最多返回的 chunk 数量（防止单一文档霸屏） */
  private readonly MAX_CHUNKS_PER_DOC = 2;

  private readonly SEARCH_LIST_MAX_CANDIDATES = 500;

  private readonly INTERACTION_TOKEN_TTL_SECONDS = 10 * 60;

  /** RRF 融合参数 */
  private readonly RRF_K = 60;

  /** 中文同义词/词根扩展映射 */
  private readonly SYNONYM_MAP: Record<string, string[]> = {
    "AI": ["人工智能", "智能", "ai", "Artificial Intelligence"],
    "催收": ["催收", "催缴", "回收", "账款"],
    "外呼": ["外呼", "外拨", "呼出", "电话营销", "电销"],
    "电销": ["电销", "电话销售", "电话营销", "外呼"],
    "坐席": ["坐席", "客服", "呼叫中心", "客服中心"],
    "IVR": ["IVR", "语音导航", "自动应答", "ivr"],
    "CRM": ["CRM", "客户管理", "客户关系", "crm"],
    "风控": ["风控", "风险控制", "风险", "信用风险"],
    "NLP": ["NLP", "自然语言处理", "语义", "nlp"],
    "机器学习": ["机器学习", "ML", "机器学习", "machine learning"],
  };

  /** 与查询词根扩展（同义/相关词） */
  private readonly STEM_EXPANSION: Record<string, string[]> = {
    "智能": ["智慧", "自动化", "自动"],
    "客户": ["用户", "消费者", "借款人", "债务人"],
    "电话": ["通话", "语音", "拨打"],
    "系统": ["平台", "工具", "软件"],
    "管理": ["管控", "治理"],
  };

  private readonly BUSINESS_TERMS = [
    "SKU",
    "SPU",
    "CRM",
    "KTV",
    "FOB",
    "CIF",
    "EXW",
    "DDP",
    "OA",
    "T/T",
    "商品",
    "规格",
    "价格",
    "库存",
    "售后",
    "包厢",
    "房型",
    "套餐",
    "低消",
    "预订",
    "外贸",
    "报价",
    "付款方式",
    "交期",
    "贸易术语",
    "客户",
    "联系人",
    "商机",
    "销售阶段",
    "跟进",
    "跟进记录",
    "工单",
  ];

  private readonly QUERY_STOPWORDS = new Set([
    "这个",
    "这份",
    "哪些",
    "什么",
    "怎么",
    "如何",
    "是否",
    "可以",
    "资料",
    "里面",
    "里的",
    "当前",
    "最近",
    "一下",
    "请问",
    "以及",
    "或者",
    "还有",
  ]);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingsService,
    private readonly access: DocumentAccessService,
    private readonly config: AppConfigService,
  ) {}

  async search(opts: SearchOptions): Promise<{
    hits: SearchHit[];
    took: number;
    hasRelevantResults: boolean;
    truncated: boolean;
  }> {
    const t0 = Date.now();
    const actor = this.toDocumentUserContext(opts.user);
    const q = opts.q.trim();
    const maxResults = this.clampLimit(opts.maxResults ?? 50, 1, this.SEARCH_LIST_MAX_CANDIDATES);
    const k = this.clampLimit(opts.topK || 10, 1, maxResults);
    const candidateLimit = this.clampLimit(opts.candidateLimit ?? Math.max(k, 50), k, maxResults);
    const sortBy = opts.sortBy ?? "relevance";
    const filters = this.normalizeSearchFilters(opts);
    const knowledgeBaseAllowed = await this.resolveKnowledgeBaseFilter(filters, actor);

    // A requested knowledge base is a security boundary. Never turn an invalid or
    // cross-tenant id into a broader tenant-wide search.
    if (!knowledgeBaseAllowed) {
      return { hits: [], took: Date.now() - t0, hasRelevantResults: false, truncated: false };
    }

    if (!q) {
      return { hits: [], took: Date.now() - t0, hasRelevantResults: false, truncated: false };
    }

    if (opts.mode === "keyword") {
      const hits = await this.bm25(actor, q, candidateLimit, filters);
      const deduped = this.deduplicateByDoc(hits, this.MAX_CHUNKS_PER_DOC);
      const accessible = await this.attachAccessFlags(deduped, actor);
      const ranked = this.sortHits(accessible, sortBy);
      const sorted = ranked.slice(0, k);
      const signed = this.attachInteractionTokens(sorted, actor, q);
      return {
        hits: signed,
        took: Date.now() - t0,
        hasRelevantResults: sorted.length > 0,
        truncated: hits.length >= candidateLimit || ranked.length > k,
      };
    }
    if (opts.mode === "semantic") {
      const hits = await this.safeVector(actor, q, candidateLimit, filters);
      const filtered = hits.filter((h) => h.score >= this.VECTOR_THRESHOLD);
      const deduped = this.deduplicateByDoc(filtered, this.MAX_CHUNKS_PER_DOC);
      const accessible = await this.attachAccessFlags(deduped, actor);
      const ranked = this.sortHits(accessible, sortBy);
      const sorted = ranked.slice(0, k);
      const signed = this.attachInteractionTokens(sorted, actor, q);
      return {
        hits: signed,
        took: Date.now() - t0,
        hasRelevantResults: sorted.length > 0,
        truncated: hits.length >= candidateLimit || ranked.length > k,
      };
    }

    // hybrid - 多策略检索：BM25 精确 + 向量 + trigram 兜底
    const [bm25Hits, vecHits] = await Promise.all([
      this.bm25(actor, q, candidateLimit, filters),
      this.safeVector(actor, q, candidateLimit, filters),
    ]);

    // 向量结果过滤低分（阈值降低以提高召回）
    const filteredVec = vecHits.filter((h) => h.score >= this.VECTOR_THRESHOLD);

    // 两路 RRF 融合
    let rrf = this.rrfFuse(bm25Hits, filteredVec, this.RRF_K, candidateLimit);
    let candidateWindowTruncated =
      bm25Hits.length >= candidateLimit || vecHits.length >= candidateLimit || rrf.length >= candidateLimit;

    // 如果 RRF 结果为空，使用 trigram 模糊搜索作为兜底
    if (rrf.length === 0) {
      this.logger.debug("RRF 无结果，触发 trigram 兜底检索");
      const trgmHits = await this.trgmSearch(actor, q, candidateLimit, filters);
      candidateWindowTruncated ||= trgmHits.length >= candidateLimit;
      if (trgmHits.length > 0) {
        rrf = this.rrfFuseTrgm(trgmHits, this.RRF_K, candidateLimit);
      }
    }

    const deduped = this.deduplicateByDoc(rrf, this.MAX_CHUNKS_PER_DOC);
    const accessible = await this.attachAccessFlags(deduped, actor);
    const ranked = this.sortHits(accessible, sortBy);
    const sorted = ranked.slice(0, k);
    const signed = this.attachInteractionTokens(sorted, actor, q);

    this.logger.debug(
      `search: bm25=${bm25Hits.length} vec=${filteredVec.length} -> rrf=${rrf.length} deduped=${deduped.length} sorted=${sorted.length}`,
    );

    return {
      hits: signed,
      took: Date.now() - t0,
      hasRelevantResults: sorted.length > 0,
      truncated: candidateWindowTruncated || ranked.length > k,
    };
  }

  /**
   * 仅 Trigram 结果的 RRF 融合（单路时退化为简单排序）
   */
  private rrfFuseTrgm(trgm: SearchHit[], k: number, finalK: number): SearchHit[] {
    const score = new Map<string, { hit: SearchHit; s: number; sources: Set<string> }>();
    trgm.forEach((h, i) => {
      const cur = score.get(h.chunkId) || { hit: h, s: 0, sources: new Set() };
      cur.s += 1 / (k + i + 1);
      cur.sources.add("trgm");
      score.set(h.chunkId, cur);
    });
    return [...score.values()]
      .sort((a, b) => b.s - a.s)
      .slice(0, finalK)
      .map((x) => ({ ...x.hit, score: x.s, sources: [...x.sources] as any }));
  }

  /**
   * 中文/英文混合全文检索
   * 使用双分词器：zhparser（中文）+ simple（英文/通用）
   * 自动检测语言并选择合适的分词方式
   */
  private async bm25(actor: DocumentUserContext, q: string, k: number, filters: SearchFilters): Promise<SearchHit[]> {
    const isChinese = this.containsChinese(q);

    if (isChinese) {
      // 1. 尝试精确分词检索
      const exactHits = await this.bm25Chinese(actor, q, k, filters);
      if (exactHits.length > 0) return exactHits;

      // 2. 无结果时，尝试扩展查询词
      const expanded = this.expandQuery(q);
      this.logger.debug(`BM25 无精确命中，扩展查询: "${q}" -> "${expanded}"`);
      const expandedHits = await this.bm25Chinese(actor, expanded, k, filters);
      if (expandedHits.length > 0) return expandedHits;

      // 3. 自然问句常包含"这个/是什么/有哪些"和领域 boost 词，AND 查询过严时降级为关键词 OR 检索。
      const keywordHits = await this.bm25KeywordFallback(actor, q, k, filters);
      if (keywordHits.length > 0) return keywordHits;

      // 4. 关键词仍无结果，降级到 simple 分词（英文分词器也可处理中文字符）
      return this.bm25English(actor, q, k, filters);
    } else {
      const hits = await this.bm25English(actor, q, k, filters);
      if (hits.length > 0) return hits;
      return this.bm25KeywordFallback(actor, q, k, filters);
    }
  }

  /**
   * 对查询进行同义词/词根扩展，改善专业术语匹配
   */
  private expandQuery(q: string): string {
    let expanded = q;

    // 精确同义词替换
    for (const [key, synonyms] of Object.entries(this.SYNONYM_MAP)) {
      if (q.includes(key)) {
        // 保留原词，并在末尾追加同义词
        expanded += " " + synonyms.join(" ");
      }
    }

    // 词根扩展
    for (const [key, related] of Object.entries(this.STEM_EXPANSION)) {
      if (q.includes(key)) {
        expanded += " " + related.join(" ");
      }
    }

    return expanded;
  }

  /**
   * 检测是否包含中文字符
   */
  private containsChinese(text: string): boolean {
    return /[\u4e00-\u9fa5]/.test(text);
  }

  private buildKeywordTerms(q: string) {
    const text = q.replace(/[^\u4e00-\u9fa5a-zA-Z0-9/_+-]+/g, " ");
    const terms: string[] = [];

    for (const term of this.BUSINESS_TERMS) {
      if (q.includes(term)) terms.push(term);
    }

    for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9/_+-]{1,30}|[0-9][A-Za-z0-9/_+-]{1,30}/g)) {
      terms.push(match[0]);
    }

    const cleaned = text
      .replace(/这个|这份|哪些|什么|怎么|如何|是否|可以|里面|里的|当前|最近|一下|请问|以及|或者|还有/g, " ")
      .replace(/\s+/g, " ");
    for (const match of cleaned.matchAll(/[\u4e00-\u9fa5]{2,12}/g)) {
      const term = match[0];
      if (!this.QUERY_STOPWORDS.has(term)) terms.push(term);
    }

    const seen = new Set<string>();
    return terms
      .map((term) => term.trim())
      .filter(Boolean)
      .filter((term) => {
        const key = term.toLowerCase();
        if (this.QUERY_STOPWORDS.has(term) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  private buildSearchQueryParts(
    actor: DocumentUserContext,
    initialValues: unknown[],
    limit: number,
    filters: SearchFilters,
  ): { whereSql: string; values: unknown[]; limitParam: string } {
    const values = [...initialValues];
    const conditions: string[] = [];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    const visibility = this.access.visibleDocumentWhereSql("d", actor, values.length + 1);
    values.push(...visibility.values);
    conditions.push(visibility.sql, "d.searchable = TRUE");

    if (filters.archived === true) {
      conditions.push("d.archived = TRUE");
    } else if (!filters.includeArchived) {
      conditions.push("d.archived = FALSE");
    }

    if (filters.fileType) conditions.push(`d.mime ILIKE ${addValue(`%${filters.fileType.trim()}%`)}`);
    if (filters.categoryId) conditions.push(`d.folder_id = ${addValue(filters.categoryId)}`);
    // 知识库维度：knowledgeBaseId 已在 search() 里校验为本租户存在的 folder（否则被丢弃）。
    if (filters.knowledgeBaseId) conditions.push(`d.folder_id = ${addValue(filters.knowledgeBaseId)}`);
    if (filters.permissionScope) conditions.push(`d.permission_scope = ${addValue(filters.permissionScope)}`);
    if (filters.parseStatus) conditions.push(`COALESCE(dc.status, d.status) = ${addValue(filters.parseStatus)}`);
    if (filters.uploaderId) conditions.push(`d.owner_id = ${addValue(filters.uploaderId)}`);
    if (filters.departmentId) conditions.push(`u.department_id = ${addValue(filters.departmentId)}`);

    if (filters.updateTimeRange === "today") {
      conditions.push("d.updated_at >= date_trunc('day', NOW())");
    } else if (filters.updateTimeRange === "7d") {
      conditions.push("d.updated_at >= NOW() - INTERVAL '7 days'");
    } else if (filters.updateTimeRange === "30d") {
      conditions.push("d.updated_at >= NOW() - INTERVAL '30 days'");
    }

    const limitParam = addValue(limit);
    return {
      whereSql: conditions.map((condition) => `(${condition})`).join("\n         AND "),
      values,
      limitParam,
    };
  }

  private searchMetricsSelectSql(): string {
    return [
      `COALESCE(metrics.hot_score, 0)::float AS "hotScore"`,
      `COALESCE(metrics.view_count, 0)::int AS "viewCount"`,
      `COALESCE(metrics.download_count, 0)::int AS "downloadCount"`,
    ].join(",\n              ");
  }

  private categoryPathSelectSql(): string {
    return `f.name AS "categoryPath"`;
  }

  private folderJoinSql(): string {
    return "LEFT JOIN folders f ON f.id = d.folder_id AND f.tenant_id = d.tenant_id";
  }

  private searchMetricsJoinSql(): string {
    return `LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_VIEW', 'VIEW'))::int AS view_count,
           COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_DOWNLOAD', 'DOWNLOAD'))::int AS download_count,
           (
             COUNT(*) FILTER (WHERE se.event_type = 'SEARCH') * 1 +
             COUNT(*) FILTER (WHERE se.event_type IN ('RESULT_CLICK', 'CLICK')) * 2 +
             COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_VIEW', 'VIEW')) * 3 +
             COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_DOWNLOAD', 'DOWNLOAD')) * 4
           )::float AS hot_score
         FROM search_events se
         WHERE se.tenant_id = d.tenant_id
           AND (
             se.document_id = d.id
             OR (se.content_id IS NOT NULL AND se.content_id = COALESCE(c.content_id, dc.id))
             OR se.chunk_id = c.id
           )
       ) metrics ON TRUE`;
  }

  private async bm25KeywordFallback(actor: DocumentUserContext, q: string, k: number, filters: SearchFilters) {
    const terms = this.buildKeywordTerms(q);
    if (terms.length === 0) return [];

    const preciseQuery = terms.slice(0, 4).join(" ");
    const preciseHits = this.containsChinese(preciseQuery)
      ? await this.bm25Chinese(actor, preciseQuery, k, filters)
      : await this.bm25English(actor, preciseQuery, k, filters);
    if (preciseHits.length > 0) return preciseHits;

    const tsQuery = terms
      .map((term) => term.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, ""))
      .filter((term) => term.length >= 2)
      .slice(0, 8)
      .join(" | ");
    if (!tsQuery) return [];

    const queryParts = this.buildSearchQueryParts(actor, [tsQuery], k, filters);
    const rows = await this.db.query<any>(
      `SELECT c.id              AS "chunkId",
              COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
              COALESCE(c.content_id, c.document_id) AS "contentId",
              c.idx             AS idx,
              c.text            AS text,
              c.page            AS page,
              COALESCE(dc.title, d.title) AS "documentTitle",
              COALESCE(dc.mime, d.mime) AS mime,
              d.permission_scope AS "permissionScope",
              ${this.categoryPathSelectSql()},
              ${this.searchMetricsSelectSql()},
              GREATEST(COALESCE(dc.updated_at, d.updated_at), d.updated_at) AS "updatedAt",
              COALESCE(dc.created_at, d.created_at) AS "createdAt",
              ts_rank_cd(c.tsv_zh, to_tsquery('zhcfg', $1)) +
              ts_rank_cd(c.tsv_simple, to_tsquery('simple', lower($1))) AS rank,
              c.text AS highlight
       FROM chunks c
       LEFT JOIN document_contents dc ON dc.id = c.content_id
       JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
       ${this.folderJoinSql()}
       LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
       ${this.searchMetricsJoinSql()}
       WHERE ${queryParts.whereSql}
         AND (
           c.tsv_zh @@ to_tsquery('zhcfg', $1)
           OR c.tsv_simple @@ to_tsquery('simple', lower($1))
         )
       ORDER BY rank DESC
       LIMIT ${queryParts.limitParam}`,
      queryParts.values,
    );
    return rows.map((r) => this.mapRowToHit(r, "bm25", q));
  }

  /**
   * 中文全文检索（使用 zhparser + zhcfg 配置）
   */
  private async bm25Chinese(actor: DocumentUserContext, q: string, k: number, filters: SearchFilters): Promise<SearchHit[]> {
    try {
      const queryParts = this.buildSearchQueryParts(actor, [q], k, filters);
      const rows = await this.db.query<any>(
        `SELECT c.id              AS "chunkId",
                COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
                COALESCE(c.content_id, c.document_id) AS "contentId",
                c.idx             AS idx,
                c.text            AS text,
                c.page            AS page,
                COALESCE(dc.title, d.title) AS "documentTitle",
                COALESCE(dc.mime, d.mime) AS mime,
                d.permission_scope AS "permissionScope",
                ${this.categoryPathSelectSql()},
                ${this.searchMetricsSelectSql()},
                GREATEST(COALESCE(dc.updated_at, d.updated_at), d.updated_at) AS "updatedAt",
                COALESCE(dc.created_at, d.created_at) AS "createdAt",
                ts_rank_cd(c.tsv_zh, plainto_tsquery('zhcfg', $1)) AS rank,
                ts_headline('zhcfg', c.text, plainto_tsquery('zhcfg', $1),
                  'StartSel=<mark>,StopSel=</mark>,MaxWords=50,MinWords=10,ShortWord=1,HighlightAll=0') AS highlight
         FROM chunks c
         LEFT JOIN document_contents dc ON dc.id = c.content_id
         JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
         ${this.folderJoinSql()}
         LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
         ${this.searchMetricsJoinSql()}
         WHERE ${queryParts.whereSql}
           AND c.tsv_zh @@ plainto_tsquery('zhcfg', $1)
         ORDER BY rank DESC
         LIMIT ${queryParts.limitParam}`,
        queryParts.values,
      );
      return rows.map((r) => this.mapRowToHit(r, "bm25", q));
    } catch (e: any) {
      this.logger.warn(`中文检索失败，尝试降级到通用分词: ${e.message}`);
      return this.bm25English(actor, q, k, filters);
    }
  }

  /**
   * 英文/通用全文检索（使用 simple 分词配置）
   */
  private async bm25English(actor: DocumentUserContext, q: string, k: number, filters: SearchFilters): Promise<SearchHit[]> {
    const queryParts = this.buildSearchQueryParts(actor, [q], k, filters);
    const rows = await this.db.query<any>(
      `SELECT c.id              AS "chunkId",
              COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
              COALESCE(c.content_id, c.document_id) AS "contentId",
              c.idx             AS idx,
              c.text            AS text,
              c.page            AS page,
              COALESCE(dc.title, d.title) AS "documentTitle",
              COALESCE(dc.mime, d.mime) AS mime,
              d.permission_scope AS "permissionScope",
              ${this.categoryPathSelectSql()},
              ${this.searchMetricsSelectSql()},
              GREATEST(COALESCE(dc.updated_at, d.updated_at), d.updated_at) AS "updatedAt",
              COALESCE(dc.created_at, d.created_at) AS "createdAt",
              ts_rank_cd(c.tsv_simple, plainto_tsquery('simple', lower($1))) AS rank,
              ts_headline('simple', c.text, plainto_tsquery('simple', lower($1)),
                'StartSel=<mark>,StopSel=</mark>,MaxWords=50,MinWords=10') AS highlight
       FROM chunks c
       LEFT JOIN document_contents dc ON dc.id = c.content_id
       JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
       ${this.folderJoinSql()}
       LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
       ${this.searchMetricsJoinSql()}
       WHERE ${queryParts.whereSql}
         AND c.tsv_simple @@ plainto_tsquery('simple', lower($1))
       ORDER BY rank DESC
       LIMIT ${queryParts.limitParam}`,
      queryParts.values,
    );
    return rows.map((r) => this.mapRowToHit(r, "bm25", q));
  }

  /**
   * 向量检索
   */
  private async vector(actor: DocumentUserContext, q: string, k: number, filters: SearchFilters): Promise<SearchHit[]> {
    const embedding = await this.embeddings.embedOne(q, "query");
    const vec = `[${embedding.join(",")}]`;
    const queryParts = this.buildSearchQueryParts(actor, [vec], k, filters);
    const rows = await this.db.query<any>(
      `SELECT c.id              AS "chunkId",
              COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
              COALESCE(c.content_id, c.document_id) AS "contentId",
              c.idx             AS idx,
              c.text            AS text,
              c.page            AS page,
              COALESCE(dc.title, d.title) AS "documentTitle",
              COALESCE(dc.mime, d.mime) AS mime,
              d.permission_scope AS "permissionScope",
              ${this.categoryPathSelectSql()},
              ${this.searchMetricsSelectSql()},
              GREATEST(COALESCE(dc.updated_at, d.updated_at), d.updated_at) AS "updatedAt",
              COALESCE(dc.created_at, d.created_at) AS "createdAt",
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM chunks c
       LEFT JOIN document_contents dc ON dc.id = c.content_id
       JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
       ${this.folderJoinSql()}
       LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
       ${this.searchMetricsJoinSql()}
       WHERE ${queryParts.whereSql}
         AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT ${queryParts.limitParam}`,
      queryParts.values,
    );
    return rows.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      contentId: r.contentId,
      documentTitle: r.documentTitle,
      mime: r.mime || "application/octet-stream",
      permissionScope: r.permissionScope,
      canDownload: false,
      categoryPath: r.categoryPath ?? null,
      idx: r.idx,
      text: r.text,
      highlight: this.buildSafeHighlight(r.text, q),
      score: Number(r.similarity) || 0,
      hotScore: Number(r.hotScore) || 0,
      viewCount: Number(r.viewCount) || 0,
      downloadCount: Number(r.downloadCount) || 0,
      sources: ["vector"] as const,
      page: r.page ?? null,
      updatedAt: this.toIsoString(r.updatedAt),
      createdAt: this.toIsoString(r.createdAt),
    }));
  }

  private async safeVector(actor: DocumentUserContext, q: string, k: number, filters: SearchFilters): Promise<SearchHit[]> {
    try {
      return await this.vector(actor, q, k, filters);
    } catch (e: any) {
      this.logger.warn(`向量检索失败，降级为关键词/模糊检索: ${e.message}`);
      return [];
    }
  }

  /**
   * Trigram 模糊匹配（中文友好，基于字符 n-gram）
   * 当精确分词检索无结果时的兜底策略
   * 特别适合：专业术语、部分匹配、拼音/英文缩写等
   */
  private async trgmSearch(actor: DocumentUserContext, q: string, k: number, filters: SearchFilters): Promise<SearchHit[]> {
    try {
      const queryParts = this.buildSearchQueryParts(actor, [q], k, filters);
      // 生成 trigram 相似度查询
      // similarity > 0.1 即可匹配（宽松），但通过 ORDER BY similarity 排序
      const rows = await this.db.query<any>(
        `SELECT c.id              AS "chunkId",
                COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
                COALESCE(c.content_id, c.document_id) AS "contentId",
                c.idx             AS idx,
                c.text            AS text,
                c.page            AS page,
                COALESCE(dc.title, d.title) AS "documentTitle",
                COALESCE(dc.mime, d.mime) AS mime,
                d.permission_scope AS "permissionScope",
                ${this.categoryPathSelectSql()},
                ${this.searchMetricsSelectSql()},
                GREATEST(COALESCE(dc.updated_at, d.updated_at), d.updated_at) AS "updatedAt",
                COALESCE(dc.created_at, d.created_at) AS "createdAt",
                similarity(c.text, $1) AS similarity,
                ts_headline('simple', c.text, plainto_tsquery('simple', $1),
                  'StartSel=<mark>,StopSel=</mark>,MaxWords=50,MinWords=10') AS highlight
         FROM chunks c
         LEFT JOIN document_contents dc ON dc.id = c.content_id
         JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
         ${this.folderJoinSql()}
         LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
         ${this.searchMetricsJoinSql()}
         WHERE ${queryParts.whereSql}
           AND c.text % $1
         ORDER BY similarity DESC
         LIMIT ${queryParts.limitParam}`,
        queryParts.values,
      );
      return rows.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        contentId: r.contentId,
        documentTitle: r.documentTitle,
        mime: r.mime || "application/octet-stream",
        permissionScope: r.permissionScope,
        canDownload: false,
        categoryPath: r.categoryPath ?? null,
        idx: r.idx,
        text: r.text,
        highlight: this.normalizeHighlight(r.highlight, r.text, q),
        score: Number(r.similarity) || 0,
        hotScore: Number(r.hotScore) || 0,
        viewCount: Number(r.viewCount) || 0,
        downloadCount: Number(r.downloadCount) || 0,
        sources: ["trgm"] as const,
        page: r.page ?? null,
        updatedAt: this.toIsoString(r.updatedAt),
        createdAt: this.toIsoString(r.createdAt),
      }));
    } catch (e: any) {
      this.logger.warn(`Trigram 检索失败: ${e.message}`);
      return [];
    }
  }

  /**
   * 将数据库行映射为 SearchHit
   */
  private mapRowToHit(r: any, source: "bm25" | "vector", q: string): SearchHit {
    return {
      chunkId: r.chunkId,
      documentId: r.documentId,
      contentId: r.contentId,
      documentTitle: r.documentTitle,
      // mime 缺失时不得默认 PDF——前端预览按 mime 分发渲染方式，错误兜底会导致按 PDF 渲染报错
      mime: r.mime || "application/octet-stream",
      permissionScope: r.permissionScope ?? r.permission_scope,
      canDownload: false,
      categoryPath: r.categoryPath ?? r.category_path ?? null,
      idx: r.idx,
      text: r.text,
      highlight: this.normalizeHighlight(r.highlight, r.text, q),
      score: Number(r.rank) || 0,
      hotScore: Number(r.hotScore ?? r.hot_score) || 0,
      viewCount: Number(r.viewCount ?? r.view_count) || 0,
      downloadCount: Number(r.downloadCount ?? r.download_count) || 0,
      sources: [source],
      page: r.page ?? null,
      updatedAt: this.toIsoString(r.updatedAt),
      createdAt: this.toIsoString(r.createdAt),
    };
  }

  /**
   * 将 Trigram 行映射为 SearchHit
   */
  private mapTrgmHit(r: any): SearchHit {
    return {
      chunkId: r.chunkId,
      documentId: r.documentId,
      contentId: r.contentId,
      documentTitle: r.documentTitle,
      mime: r.mime || "application/octet-stream",
      permissionScope: r.permissionScope ?? r.permission_scope,
      canDownload: false,
      categoryPath: r.categoryPath ?? r.category_path ?? null,
      idx: r.idx,
      text: r.text,
      highlight: this.normalizeHighlight(r.highlight, r.text, ""),
      score: Number(r.similarity) || 0,
      hotScore: Number(r.hotScore ?? r.hot_score) || 0,
      viewCount: Number(r.viewCount ?? r.view_count) || 0,
      downloadCount: Number(r.downloadCount ?? r.download_count) || 0,
      sources: ["trgm"],
      page: r.page ?? null,
      updatedAt: this.toIsoString(r.updatedAt),
      createdAt: this.toIsoString(r.createdAt),
    };
  }

  private mapFilterDocumentRow(r: any): SearchHit {
    const text = String(r.text ?? r.documentTitle ?? "");
    return {
      chunkId: r.chunkId,
      documentId: r.documentId,
      contentId: r.contentId,
      documentTitle: r.documentTitle,
      mime: r.mime || "application/octet-stream",
      permissionScope: r.permissionScope ?? r.permission_scope,
      canDownload: false,
      categoryPath: r.categoryPath ?? r.category_path ?? null,
      idx: Number(r.idx) || 0,
      text,
      highlight: this.escapeHtml(text),
      score: 0,
      hotScore: Number(r.hotScore ?? r.hot_score) || 0,
      viewCount: Number(r.viewCount ?? r.view_count) || 0,
      downloadCount: Number(r.downloadCount ?? r.download_count) || 0,
      sources: [],
      page: r.page ?? null,
      updatedAt: this.toIsoString(r.updatedAt),
      createdAt: this.toIsoString(r.createdAt),
    };
  }

  private normalizeHighlight(highlight: unknown, text: unknown, q: string): string {
    const rawHighlight = String(highlight ?? "");
    const sanitized = rawHighlight.trim() ? this.sanitizeHighlight(rawHighlight) : "";
    if (sanitized.includes("<mark>")) return sanitized;
    return this.buildSafeHighlight(String(text ?? rawHighlight), q);
  }

  private buildSafeHighlight(text: string, q: string, maxChars = 220): string {
    const terms = this.buildHighlightTerms(q);
    const snippet = this.extractSnippet(text, terms, maxChars);
    if (terms.length === 0) return this.escapeHtml(snippet);

    const pattern = this.buildHighlightPattern(terms);
    let result = "";
    let lastIndex = 0;

    for (const match of snippet.matchAll(pattern)) {
      const value = match[0];
      const index = match.index ?? 0;
      result += this.escapeHtml(snippet.slice(lastIndex, index));
      result += `<mark>${this.escapeHtml(value)}</mark>`;
      lastIndex = index + value.length;
    }

    result += this.escapeHtml(snippet.slice(lastIndex));
    return result;
  }

  private sanitizeHighlight(value: string): string {
    return value
      .split(/(<\/?mark>)/gi)
      .map((part) => {
        const tag = part.toLowerCase();
        if (tag === "<mark>" || tag === "</mark>") return tag;
        return this.escapeHtml(part);
      })
      .join("");
  }

  private buildHighlightTerms(q: string): string[] {
    const terms = [...this.buildKeywordTerms(q)];
    const trimmed = q.trim();
    if (trimmed.length >= 2 && trimmed.length <= 80) terms.push(trimmed);

    const seen = new Set<string>();
    return terms
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
      .filter((term) => {
        const key = term.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);
  }

  private extractSnippet(text: string, terms: string[], maxChars: number): string {
    if (text.length <= maxChars) return text;

    const lowerText = text.toLocaleLowerCase();
    const firstMatch = terms.reduce<number>((best, term) => {
      const index = lowerText.indexOf(term.toLocaleLowerCase());
      if (index === -1) return best;
      return best === -1 ? index : Math.min(best, index);
    }, -1);

    if (firstMatch === -1) return text.slice(0, maxChars);

    const contextBefore = Math.floor(maxChars * 0.35);
    let start = Math.max(0, firstMatch - contextBefore);
    let end = Math.min(text.length, start + maxChars);
    start = Math.max(0, end - maxChars);

    const prefix = start > 0 ? "..." : "";
    const suffix = end < text.length ? "..." : "";
    return `${prefix}${text.slice(start, end)}${suffix}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private buildHighlightPattern(terms: string[]): RegExp {
    const keywordChars = "[A-Za-z0-9/_+-]";
    const parts = terms.map((term) => {
      const escaped = this.escapeRegExp(term);
      if (/^[A-Za-z0-9/_+-]+$/.test(term)) {
        return `(?<!${keywordChars})${escaped}(?!${keywordChars})`;
      }
      return escaped;
    });
    return new RegExp(parts.join("|"), "giu");
  }

  private sortHits(hits: SearchHit[], sortBy: SearchSortBy): SearchHit[] {
    return [...hits].sort((a, b) => {
      if (sortBy === "time" || sortBy === "updatedAt") {
        return this.timestampOf(b) - this.timestampOf(a) || b.score - a.score || a.idx - b.idx;
      }
      if (sortBy === "name") {
        return (
          a.documentTitle.localeCompare(b.documentTitle, undefined, { sensitivity: "base" }) ||
          a.idx - b.idx ||
          b.score - a.score
        );
      }
      if (sortBy === "hot") {
        return (b.hotScore ?? 0) - (a.hotScore ?? 0) || b.score - a.score || this.timestampOf(b) - this.timestampOf(a);
      }
      if (sortBy === "views") {
        return (b.viewCount ?? 0) - (a.viewCount ?? 0) || b.score - a.score || this.timestampOf(b) - this.timestampOf(a);
      }
      if (sortBy === "downloads") {
        return (b.downloadCount ?? 0) - (a.downloadCount ?? 0) || b.score - a.score || this.timestampOf(b) - this.timestampOf(a);
      }
      return b.score - a.score || this.timestampOf(b) - this.timestampOf(a) || a.idx - b.idx;
    });
  }

  private documentFilterSortSql(sortBy: SearchSortBy): string {
    if (sortBy === "name") return `d.title ASC, d.updated_at DESC`;
    if (sortBy === "hot") return `COALESCE(metrics.hot_score, 0) DESC, d.updated_at DESC`;
    if (sortBy === "views") return `COALESCE(metrics.view_count, 0) DESC, d.updated_at DESC`;
    if (sortBy === "downloads") return `COALESCE(metrics.download_count, 0) DESC, d.updated_at DESC`;
    return `d.updated_at DESC, d.created_at DESC`;
  }

  private hasActiveSearchListFilter(query: SearchListQuery): boolean {
    return Boolean(
      query.fileType ||
        query.categoryId ||
        query.permissionScope ||
        (query.updateTimeRange && query.updateTimeRange !== "all") ||
        query.parseStatus ||
        query.uploaderId ||
        query.departmentId,
    );
  }

  private timestampOf(hit: SearchHit): number {
    const value = hit.updatedAt || hit.createdAt;
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  private toIsoString(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }

  async searchList(rawQuery: unknown, user?: any) {
    const parsed = SearchListQuery.safeParse(rawQuery ?? {});
    if (!parsed.success) {
      return {
        query: "",
        mode: "hybrid" as const,
        sortBy: "relevance" as const,
        total: 0,
        hits: [],
        took: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
        truncated: false,
        error: "invalid_query",
      };
    }

    const query = parsed.data;
    const keyword = this.normalizeKeyword(query.keyword ?? query.q ?? "");
    if (!keyword) {
      if (this.hasActiveSearchListFilter(query)) {
        return this.searchListByFilters(query, user);
      }
      return {
        query: "",
        mode: query.mode,
        sortBy: query.sort,
        total: 0,
        hits: [],
        took: 0,
        page: query.page,
        pageSize: query.pageSize,
        hasMore: false,
        truncated: false,
      };
    }

    const actor = this.toDocumentUserContext(user);
    const result = await this.search({
      q: keyword,
      mode: query.mode,
      sortBy: query.sort,
      // SearchList needs the complete bounded result window so total/hasMore are not
      // confused with the current page. The cap keeps vector/BM25 work predictable.
      topK: this.SEARCH_LIST_MAX_CANDIDATES,
      maxResults: this.SEARCH_LIST_MAX_CANDIDATES,
      candidateLimit: this.SEARCH_LIST_MAX_CANDIDATES,
      filters: query,
      user,
    });
    const offset = (query.page - 1) * query.pageSize;
    const hits = result.hits.slice(offset, offset + query.pageSize);
    const total = result.hits.length;

    // Pagination is browsing an existing result set, not another explicit search.
    // Record the initial keyword request exactly once; filter-only browsing never reaches here.
    if (query.page === 1) {
      await this.recordHistory({
        q: keyword,
        mode: query.mode,
        sortBy: query.sort,
        topK: query.pageSize,
        resultCount: total,
        tenantId: actor.tenantId,
        userId: actor.userId,
      });
      await this.recordSearchEvent({
        keyword,
        eventType: "SEARCH",
        resultCount: total,
        tenantId: actor.tenantId,
        userId: actor.userId,
        categoryId: query.categoryId ?? null,
      });
    }

    return {
      query: keyword,
      mode: query.mode,
      sortBy: query.sort,
      total,
      hits,
      took: result.took,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: offset + hits.length < total,
      hasRelevantResults: result.hasRelevantResults,
      truncated: result.truncated || total >= this.SEARCH_LIST_MAX_CANDIDATES,
      resultLimit: this.SEARCH_LIST_MAX_CANDIDATES,
    };
  }

  private async searchListByFilters(query: SearchListQuery, user?: any) {
    const t0 = Date.now();
    const actor = this.toDocumentUserContext(user);
    const queryParts = this.buildSearchQueryParts(actor, [], query.pageSize, query);
    const values = [...queryParts.values];
    values.push((query.page - 1) * query.pageSize);
    const offsetParam = `$${values.length}`;

    const rows = await this.db.query<any>(
      `SELECT
         COALESCE(first_chunk.id, d.id) AS "chunkId",
         d.id AS "documentId",
         d.content_id AS "contentId",
         COALESCE(first_chunk.idx, 0) AS idx,
         COALESCE(first_chunk.text, d.title) AS text,
         COALESCE(first_chunk.text, d.title) AS highlight,
         first_chunk.page AS page,
         d.title AS "documentTitle",
         d.mime AS mime,
         d.permission_scope AS "permissionScope",
         ${this.categoryPathSelectSql()},
         COALESCE(metrics.hot_score, 0)::float AS "hotScore",
         COALESCE(metrics.view_count, 0)::int AS "viewCount",
         COALESCE(metrics.download_count, 0)::int AS "downloadCount",
         d.updated_at AS "updatedAt",
         d.created_at AS "createdAt",
         COUNT(*) OVER()::int AS "totalCount"
       FROM documents d
       LEFT JOIN document_contents dc ON dc.id = d.content_id
       ${this.folderJoinSql()}
       LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
       LEFT JOIN LATERAL (
         SELECT c.id, c.idx, c.text, c.page
         FROM chunks c
         WHERE c.content_id = d.content_id
            OR (c.content_id IS NULL AND c.document_id = d.id)
         ORDER BY c.idx ASC
         LIMIT 1
       ) first_chunk ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_VIEW', 'VIEW'))::int AS view_count,
           COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_DOWNLOAD', 'DOWNLOAD'))::int AS download_count,
           (
             COUNT(*) FILTER (WHERE se.event_type = 'SEARCH') * 1 +
             COUNT(*) FILTER (WHERE se.event_type IN ('RESULT_CLICK', 'CLICK')) * 2 +
             COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_VIEW', 'VIEW')) * 3 +
             COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_DOWNLOAD', 'DOWNLOAD')) * 4
           )::float AS hot_score
         FROM search_events se
         WHERE se.tenant_id = d.tenant_id
           AND (
             se.document_id = d.id
             OR (se.content_id IS NOT NULL AND se.content_id = d.content_id)
             OR se.chunk_id = first_chunk.id
           )
       ) metrics ON TRUE
       WHERE ${queryParts.whereSql}
       ORDER BY ${this.documentFilterSortSql(query.sort)}
       LIMIT ${queryParts.limitParam} OFFSET ${offsetParam}`,
      values,
    );

    let total = rows[0]?.totalCount ? Number(rows[0].totalCount) : 0;
    if (rows.length === 0 && query.page > 1) {
      const countRows = await this.db.query<{ totalCount: number | string }>(
        `SELECT COUNT(*)::int AS "totalCount"
         FROM documents d
         LEFT JOIN document_contents dc ON dc.id = d.content_id
         LEFT JOIN users u ON u.id = d.owner_id AND u.tenant_id = d.tenant_id
         WHERE ${queryParts.whereSql}`,
        queryParts.values.slice(0, -1),
      );
      total = Number(countRows[0]?.totalCount ?? 0);
    }

    const hits = await this.attachAccessFlags(
      rows.map((row) => this.mapFilterDocumentRow(row)),
      actor,
    );

    return {
      query: "",
      mode: query.mode,
      sortBy: query.sort,
      total,
      hits,
      took: Date.now() - t0,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page * query.pageSize < total,
      hasRelevantResults: hits.length > 0,
      truncated: false,
    };
  }

  async listHotSearch(rawQuery: unknown): Promise<HotSearchItem[]> {
    const parsed = HotSearchQuery.safeParse(rawQuery ?? {});
    const query = parsed.success ? parsed.data : HotSearchQuery.parse({});
    const tenantId = this.db.tenantId;
    if (!tenantId) return [];

    const values: unknown[] = [tenantId];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const eventFilters = ["se.tenant_id = $1"];
    const pinnedFilters = ["hk.tenant_id = $1", "hk.enabled = TRUE"];

    if (query.categoryId) {
      const categoryParam = addValue(query.categoryId);
      eventFilters.push(`se.category_id = ${categoryParam}`);
      pinnedFilters.push(`(hk.category_id = ${categoryParam} OR hk.category_id IS NULL)`);
    }

    const rangeSql = this.hotRangeSql(query.range);
    if (rangeSql) eventFilters.push(rangeSql);

    const limitParam = addValue(query.limit);
    const rows = await this.db.query<any>(
      `WITH event_counts AS (
         SELECT
           lower(regexp_replace(trim(se.keyword), '\\s+', ' ', 'g')) AS keyword,
           se.category_id AS "categoryId",
           COUNT(*) FILTER (WHERE se.event_type = 'SEARCH')::int AS "searchCount",
           COUNT(*) FILTER (WHERE se.event_type IN ('RESULT_CLICK', 'CLICK'))::int AS "clickCount",
           COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_VIEW', 'VIEW'))::int AS "viewCount",
           COUNT(*) FILTER (WHERE se.event_type IN ('DOCUMENT_DOWNLOAD', 'DOWNLOAD'))::int AS "downloadCount",
           COALESCE(SUM(CASE WHEN se.event_type = 'SEARCH' THEN se.result_count ELSE 0 END), 0)::int AS "resultCount"
         FROM search_events se
         WHERE ${eventFilters.join(" AND ")}
         GROUP BY 1, se.category_id
       ),
       pinned_keywords AS (
         SELECT
           lower(regexp_replace(trim(hk.keyword), '\\s+', ' ', 'g')) AS keyword,
           hk.category_id AS "categoryId",
           bool_or(hk.pinned) AS pinned,
           MAX(CASE WHEN hk.pinned THEN GREATEST(hk.weight, 100) ELSE hk.weight END)::int AS weight
         FROM hot_search_keywords hk
         WHERE ${pinnedFilters.join(" AND ")}
         GROUP BY 1, hk.category_id
       ),
       combined AS (
         SELECT
           COALESCE(ec.keyword, pk.keyword) AS keyword,
           COALESCE(ec."categoryId", pk."categoryId") AS "categoryId",
           COALESCE(ec."searchCount", 0)::int AS "searchCount",
           COALESCE(ec."clickCount", 0)::int AS "clickCount",
           COALESCE(ec."viewCount", 0)::int AS "viewCount",
           COALESCE(ec."downloadCount", 0)::int AS "downloadCount",
           COALESCE(ec."resultCount", 0)::int AS "resultCount",
           COALESCE(pk.pinned, FALSE) AS pinned,
           COALESCE(pk.weight, 0)::int AS "pinnedWeight",
           (
             COALESCE(ec."searchCount", 0) * 1 +
             COALESCE(ec."clickCount", 0) * 2 +
             COALESCE(ec."viewCount", 0) * 3 +
             COALESCE(ec."downloadCount", 0) * 4 +
             COALESCE(pk.weight, 0)
           )::float AS "hotScore"
         FROM event_counts ec
         FULL OUTER JOIN pinned_keywords pk
           ON pk.keyword = ec.keyword
          AND (pk."categoryId" IS NOT DISTINCT FROM ec."categoryId" OR pk."categoryId" IS NULL)
       ),
       filtered AS (
         SELECT *
         FROM combined
         WHERE keyword <> ''
           AND (
             pinned = TRUE
             OR "resultCount" > 0
             OR "clickCount" > 0
             OR "viewCount" > 0
             OR "downloadCount" > 0
           )
       )
       SELECT
         keyword,
         "categoryId",
         "searchCount",
         "clickCount",
         "viewCount",
         "downloadCount",
         "resultCount",
         pinned,
         "pinnedWeight"
       FROM filtered
       ORDER BY "hotScore" DESC, keyword ASC
       LIMIT ${limitParam}`,
      values,
    );

    return rows
      .map((row) => this.mapHotSearchRow(row))
      .filter((item) => item.keyword.length > 0)
      .filter((item) => {
        const resultCount = this.numberOf((item as any).resultCount);
        return item.pinned || resultCount > 0 || item.clickCount > 0 || item.viewCount > 0 || item.downloadCount > 0;
      })
      .sort((a, b) => b.hotScore - a.hotScore || a.keyword.localeCompare(b.keyword))
      .slice(0, query.limit)
      .map(({ resultCount: _resultCount, ...item }: HotSearchItem & { resultCount?: number }) => item);
  }

  async recordSearchEvent(input: SearchEventInput): Promise<void> {
    const tenantId = input.tenantId || this.db.tenantId;
    const keyword = this.normalizeKeyword(input.keyword ?? input.q ?? "");
    if (!tenantId || !keyword) return;

    const eventType = this.normalizeSearchEventType(input.eventType);
    const resultCount = Math.max(0, Math.trunc(this.numberOf(input.resultCount)));

    try {
      await this.db.query(
        `INSERT INTO search_events (
           id,
           tenant_id,
           user_id,
           keyword,
           category_id,
           document_id,
           content_id,
           chunk_id,
           result_count,
           event_type
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          tenantId,
          input.userId ?? this.db.userId ?? null,
          keyword,
          input.categoryId ?? null,
          input.documentId ?? null,
          input.contentId ?? null,
          input.chunkId ?? null,
          resultCount,
          eventType,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`Failed to record search event: ${e.message}`);
    }
  }

  /**
   * Records an untrusted client interaction only after resolving its target inside
   * the authenticated tenant and checking the actor's effective document access.
   * SEARCH events are server-generated by the actual search paths and are not
   * accepted through the public telemetry endpoint.
   */
  async recordResultInteraction(input: SearchEventInput, user?: any): Promise<boolean> {
    const actor = this.toDocumentUserContext(user);
    const keyword = this.normalizeKeyword(input.keyword ?? input.q ?? "");
    const eventType = this.normalizeSearchEventType(input.eventType);
    if (
      !actor.tenantId
      || !actor.userId
      || !keyword
      || (eventType !== "DOCUMENT_VIEW" && eventType !== "DOCUMENT_DOWNLOAD")
    ) return false;

    const documentId = input.documentId?.trim() || null;
    const interactionToken = input.interactionToken?.trim() || "";
    if (!documentId || !interactionToken) return false;
    if (!this.verifyInteractionToken(interactionToken, actor, keyword, documentId)) return false;

    const targets = await this.db.query<{ documentId: string; categoryId: string | null }>(
      `SELECT d.id AS "documentId", d.folder_id AS "categoryId"
       FROM documents d
       WHERE d.tenant_id = $1
         AND d.deleted_at IS NULL
         AND d.id = $2
       LIMIT 1`,
      [actor.tenantId, documentId],
    );
    if (targets.length !== 1) return false;

    const target = targets[0];
    const flags = (await this.access.getAccessFlags([target.documentId], actor))[target.documentId];
    const allowed = eventType === "DOCUMENT_DOWNLOAD" ? flags?.canDownload : flags?.canView;
    if (!allowed) return false;

    const dedupeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const interactionId = `search_interaction_${createHmac("sha256", this.config.jwt.accessSecret)
      .update(JSON.stringify([
        actor.tenantId,
        actor.userId,
        keyword,
        target.documentId,
        eventType,
        dedupeBucket,
      ]))
      .digest("hex")}`;

    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO search_events (
         id, tenant_id, user_id, keyword, category_id, document_id,
         content_id, chunk_id, result_count, event_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 0, $7)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        interactionId,
        actor.tenantId,
        actor.userId,
        keyword,
        target.categoryId,
        target.documentId,
        eventType,
      ],
    );
    return inserted.length === 1;
  }

  private mapHotSearchRow(row: any): HotSearchItem & { resultCount: number } {
    const searchCount = this.numberOf(row.searchCount ?? row.search_count);
    const clickCount = this.numberOf(row.clickCount ?? row.click_count);
    const viewCount = this.numberOf(row.viewCount ?? row.view_count);
    const downloadCount = this.numberOf(row.downloadCount ?? row.download_count);
    const pinnedWeight = this.numberOf(row.pinnedWeight ?? row.pinned_weight ?? row.weight);
    return {
      keyword: this.normalizeKeyword(row.keyword ?? ""),
      hotScore: this.hotScore({ searchCount, clickCount, viewCount, downloadCount, pinnedWeight }),
      searchCount,
      clickCount,
      viewCount,
      downloadCount,
      resultCount: this.numberOf(row.resultCount ?? row.result_count),
      trend: "flat",
      categoryId: row.categoryId ?? row.category_id ?? null,
      pinned: Boolean(row.pinned),
    };
  }

  private hotScore(input: {
    searchCount?: unknown;
    clickCount?: unknown;
    viewCount?: unknown;
    downloadCount?: unknown;
    pinnedWeight?: unknown;
  }): number {
    return (
      this.numberOf(input.searchCount) * 1 +
      this.numberOf(input.clickCount) * 2 +
      this.numberOf(input.viewCount) * 3 +
      this.numberOf(input.downloadCount) * 4 +
      this.numberOf(input.pinnedWeight)
    );
  }

  private hotRangeSql(range: "today" | "week" | "month" | "all"): string {
    if (range === "today") return "se.created_at >= date_trunc('day', NOW())";
    if (range === "week") return "se.created_at >= NOW() - INTERVAL '7 days'";
    if (range === "month") return "se.created_at >= NOW() - INTERVAL '30 days'";
    return "";
  }

  private normalizeSearchEventType(value?: string): string {
    const eventType = (value || "SEARCH").trim().toUpperCase() || "SEARCH";
    if (eventType === "CLICK") return "RESULT_CLICK";
    if (eventType === "VIEW") return "DOCUMENT_VIEW";
    if (eventType === "DOWNLOAD") return "DOCUMENT_DOWNLOAD";
    return eventType;
  }

  private normalizeKeyword(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }

  private numberOf(value: unknown): number {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private clampLimit(value: unknown, min: number, max: number): number {
    const number = Math.trunc(this.numberOf(value));
    return Math.min(Math.max(number || min, min), max);
  }

  private toDocumentUserContext(user?: any): DocumentUserContext {
    return {
      userId: user?.sub ?? user?.userId ?? user?.id ?? this.db.userId ?? "",
      tenantId: user?.tenantId ?? this.db.tenantId ?? "",
      role: user?.role ?? (this.db as any).role ?? "viewer",
      departmentId: user?.departmentId ?? null,
    };
  }

  private normalizeSearchFilters(opts: SearchOptions): SearchFilters {
    return {
      ...(opts.filters ?? {}),
    };
  }

  /**
   * 解析 knowledgeBaseId（ai-call 的知识库 id）→ ai-knowledge 的 folder 维度。
   * 只有当前租户中真实存在的 folder 才允许继续检索；无效或跨租户 id 返回 false，
   * 调用方据此直接返回空结果，避免越界扩大检索范围。
   */
  private async resolveKnowledgeBaseFilter(
    filters: SearchFilters,
    actor: DocumentUserContext,
  ): Promise<boolean> {
    const kbId = filters.knowledgeBaseId?.trim();
    if (!kbId) {
      delete filters.knowledgeBaseId;
      return true;
    }
    const tenantId = actor.tenantId;
    if (!tenantId) {
      delete filters.knowledgeBaseId;
      return false;
    }
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM folders WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [kbId, tenantId],
    );
    if (rows.length === 0) {
      return false;
    }
    filters.knowledgeBaseId = kbId;
    return true;
  }

  private async attachAccessFlags(hits: SearchHit[], actor: DocumentUserContext): Promise<SearchHit[]> {
    const documentIds = [...new Set(hits.map((hit) => hit.documentId).filter(Boolean))];
    if (documentIds.length === 0) return [];

    const flags = await this.access.getAccessFlags(documentIds, actor);
    return hits
      .filter((hit) => flags[hit.documentId]?.canView ?? false)
      .map((hit) => this.withAccessFlags(hit, flags[hit.documentId]));
  }

  private withAccessFlags(hit: SearchHit, flags?: DocumentAccessFlags): SearchHit {
    return {
      ...hit,
      canDownload: flags?.canDownload ?? false,
    };
  }

  private attachInteractionTokens(
    hits: SearchHit[],
    actor: DocumentUserContext,
    keyword: string,
  ): SearchHit[] {
    if (!actor.tenantId || !actor.userId) return hits;
    const normalizedKeyword = this.normalizeKeyword(keyword);
    if (!normalizedKeyword) return hits;
    return hits.map((hit) => ({
      ...hit,
      interactionToken: this.createInteractionToken({
        v: 1,
        tenantId: actor.tenantId,
        userId: actor.userId,
        keyword: normalizedKeyword,
        documentId: hit.documentId,
        exp: Math.floor(Date.now() / 1000) + this.INTERACTION_TOKEN_TTL_SECONDS,
      }),
    }));
  }

  private createInteractionToken(payload: SearchInteractionTokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.config.jwt.accessSecret)
      .update(encodedPayload)
      .digest("base64url");
    return `${encodedPayload}.${signature}`;
  }

  private verifyInteractionToken(
    token: string,
    actor: DocumentUserContext,
    keyword: string,
    documentId: string,
  ): boolean {
    try {
      const [encodedPayload, providedSignature, extra] = token.split(".");
      if (!encodedPayload || !providedSignature || extra) return false;
      const expectedSignature = createHmac("sha256", this.config.jwt.accessSecret)
        .update(encodedPayload)
        .digest("base64url");
      const provided = Buffer.from(providedSignature, "base64url");
      const expected = Buffer.from(expectedSignature, "base64url");
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;

      const payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as Partial<SearchInteractionTokenPayload>;
      const now = Math.floor(Date.now() / 1000);
      return payload.v === 1
        && payload.exp !== undefined
        && Number.isSafeInteger(payload.exp)
        && payload.exp >= now
        && payload.exp <= now + this.INTERACTION_TOKEN_TTL_SECONDS
        && payload.tenantId === actor.tenantId
        && payload.userId === actor.userId
        && payload.keyword === keyword
        && payload.documentId === documentId;
    } catch {
      return false;
    }
  }

  async recordHistory(opts: {
    q: string;
    mode: "hybrid" | "semantic" | "keyword";
    sortBy: SearchSortBy;
    topK: number;
    resultCount: number;
    tenantId?: string;
    userId?: string;
  }): Promise<void> {
    const tenantId = opts.tenantId || this.db.tenantId;
    const userId = opts.userId || this.db.userId;
    const query = this.normalizeKeyword(opts.q);
    if (!tenantId || !userId || !query) return;

    try {
      await this.db.query(
        `DELETE FROM search_histories
         WHERE tenant_id = $1
           AND user_id = $2
           AND lower(regexp_replace(trim(query), '\\s+', ' ', 'g')) = $3`,
        [tenantId, userId, query],
      );
      await this.db.query(
        `INSERT INTO search_histories
           (id, tenant_id, user_id, query, mode, sort_by, top_k, result_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          tenantId,
          userId,
          query,
          opts.mode,
          opts.sortBy,
          opts.topK,
          opts.resultCount,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`记录搜索历史失败: ${e.message}`);
    }
  }

  async listHistory(opts: { limit?: number; tenantId?: string; userId?: string } = {}): Promise<SearchHistoryItem[]> {
    const tenantId = opts.tenantId || this.db.tenantId;
    const userId = opts.userId || this.db.userId;
    if (!tenantId || !userId) return [];

    const limit = this.clampHistoryLimit(opts.limit);
    const rows = await this.db.query<any>(
      `SELECT id,
              query,
              mode,
              sort_by AS "sortBy",
              top_k AS "topK",
              result_count AS "resultCount",
              created_at AS "createdAt"
       FROM search_histories
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, userId, limit],
    );

    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      mode: row.mode,
      sortBy: row.sortBy || "relevance",
      topK: Number(row.topK) || 10,
      resultCount: Number(row.resultCount) || 0,
      createdAt: this.toIsoString(row.createdAt) || new Date(0).toISOString(),
    }));
  }

  async deleteHistory(id: string, opts: { tenantId?: string; userId?: string } = {}): Promise<{ deleted: number }> {
    const tenantId = opts.tenantId || this.db.tenantId;
    const userId = opts.userId || this.db.userId;
    if (!tenantId || !userId) return { deleted: 0 };

    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM search_histories
       WHERE tenant_id = $1 AND user_id = $2 AND id = $3
       RETURNING id`,
      [tenantId, userId, id],
    );
    return { deleted: rows.length };
  }

  async clearHistory(opts: { tenantId?: string; userId?: string } = {}): Promise<{ deleted: number }> {
    const tenantId = opts.tenantId || this.db.tenantId;
    const userId = opts.userId || this.db.userId;
    if (!tenantId || !userId) return { deleted: 0 };

    const rows = await this.db.query<{ id: string }>(
      `DELETE FROM search_histories
       WHERE tenant_id = $1 AND user_id = $2
       RETURNING id`,
      [tenantId, userId],
    );
    return { deleted: rows.length };
  }

  private clampHistoryLimit(limit = 20): number {
    if (!Number.isFinite(limit)) return 20;
    return Math.min(Math.max(Math.trunc(limit), 1), 100);
  }

  /**
   * 每个文档最多保留 n 个 chunk，保留得分最高的
   */
  private deduplicateByDoc(hits: SearchHit[], maxPerDoc: number): SearchHit[] {
    const docCount = new Map<string, number>();
    return hits.filter((h) => {
      const key = h.contentId || h.documentId;
      const cnt = docCount.get(key) ?? 0;
      if (cnt >= maxPerDoc) return false;
      docCount.set(key, cnt + 1);
      return true;
    });
  }

  /**
   * RRF (Reciprocal Rank Fusion) 融合（保留向后兼容）
   * 公式: score(d) = Σ 1/(k + rank_i(d))
   */
  private rrfFuse(
    bm25: SearchHit[],
    vec: SearchHit[],
    k: number,
    finalK: number,
  ): SearchHit[] {
    const score = new Map<string, { hit: SearchHit; s: number; sources: Set<string> }>();
    bm25.forEach((h, i) => {
      const cur = score.get(h.chunkId) || { hit: h, s: 0, sources: new Set() };
      cur.s += 1 / (k + i + 1);
      cur.sources.add("bm25");
      score.set(h.chunkId, cur);
    });
    vec.forEach((h, i) => {
      const cur = score.get(h.chunkId) || { hit: h, s: 0, sources: new Set() };
      cur.s += 1 / (k + i + 1);
      cur.sources.add("vector");
      score.set(h.chunkId, cur);
    });
    return [...score.values()]
      .sort((a, b) => b.s - a.s)
      .slice(0, finalK)
      .map((x) => ({ ...x.hit, score: x.s, sources: [...x.sources] as any }));
  }
}
