import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { EmbeddingsService } from "../embeddings/embeddings.service";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  contentId?: string;
  documentTitle: string;
  mime: string;          // 文档 MIME 类型
  idx: number;
  text: string;
  highlight: string;
  score: number;
  sources: Array<"bm25" | "vector" | "trgm">;
  page: number | null;  // PDF 页码（1-based）
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  /** 向量相似度阈值，低于此值的结果将被过滤 */
  private readonly VECTOR_THRESHOLD = 0.6;

  /** 每个文档最多返回的 chunk 数量（防止单一文档霸屏） */
  private readonly MAX_CHUNKS_PER_DOC = 2;

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
  ) {}

  async search(opts: {
    q: string;
    mode: "hybrid" | "semantic" | "keyword";
    topK: number;
    tags?: string[];
  }): Promise<{ hits: SearchHit[]; took: number; hasRelevantResults: boolean }> {
    const t0 = Date.now();
    const tenantId = this.db.tenantId!;
    const k = Math.min(opts.topK || 10, 50);

    if (opts.mode === "keyword") {
      const hits = await this.bm25(tenantId, opts.q, k);
      const deduped = this.deduplicateByDoc(hits, this.MAX_CHUNKS_PER_DOC);
      return { hits: deduped, took: Date.now() - t0, hasRelevantResults: deduped.length > 0 };
    }
    if (opts.mode === "semantic") {
      const hits = await this.safeVector(tenantId, opts.q, 50);
      const filtered = hits.filter((h) => h.score >= this.VECTOR_THRESHOLD);
      const deduped = this.deduplicateByDoc(filtered, this.MAX_CHUNKS_PER_DOC);
      return { hits: deduped.slice(0, k), took: Date.now() - t0, hasRelevantResults: deduped.length > 0 };
    }

    // hybrid - 多策略检索：BM25 精确 + 向量 + trigram 兜底
    const [bm25Hits, vecHits] = await Promise.all([
      this.bm25(tenantId, opts.q, 50),
      this.safeVector(tenantId, opts.q, 50),
    ]);

    // 向量结果过滤低分（阈值降低以提高召回）
    const filteredVec = vecHits.filter((h) => h.score >= this.VECTOR_THRESHOLD);

    // 两路 RRF 融合
    let rrf = this.rrfFuse(bm25Hits, filteredVec, this.RRF_K, k);

    // 如果 RRF 结果为空，使用 trigram 模糊搜索作为兜底
    if (rrf.length === 0) {
      this.logger.debug("RRF 无结果，触发 trigram 兜底检索");
      const trgmHits = await this.trgmSearch(tenantId, opts.q, k);
      if (trgmHits.length > 0) {
        rrf = this.rrfFuseTrgm(trgmHits, this.RRF_K, k);
      }
    }

    const deduped = this.deduplicateByDoc(rrf, this.MAX_CHUNKS_PER_DOC);

    this.logger.debug(
      `search: bm25=${bm25Hits.length} vec=${filteredVec.length} -> rrf=${rrf.length} deduped=${deduped.length}`,
    );

    return { hits: deduped, took: Date.now() - t0, hasRelevantResults: deduped.length > 0 };
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
  private async bm25(tenantId: string, q: string, k: number): Promise<SearchHit[]> {
    const isChinese = this.containsChinese(q);

    if (isChinese) {
      // 1. 尝试精确分词检索
      const exactHits = await this.bm25Chinese(tenantId, q, k);
      if (exactHits.length > 0) return exactHits;

      // 2. 无结果时，尝试扩展查询词
      const expanded = this.expandQuery(q);
      this.logger.debug(`BM25 无精确命中，扩展查询: "${q}" -> "${expanded}"`);
      const expandedHits = await this.bm25Chinese(tenantId, expanded, k);
      if (expandedHits.length > 0) return expandedHits;

      // 3. 自然问句常包含"这个/是什么/有哪些"和领域 boost 词，AND 查询过严时降级为关键词 OR 检索。
      const keywordHits = await this.bm25KeywordFallback(tenantId, q, k);
      if (keywordHits.length > 0) return keywordHits;

      // 4. 关键词仍无结果，降级到 simple 分词（英文分词器也可处理中文字符）
      return this.bm25English(tenantId, q, k);
    } else {
      const hits = await this.bm25English(tenantId, q, k);
      if (hits.length > 0) return hits;
      return this.bm25KeywordFallback(tenantId, q, k);
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

  private async bm25KeywordFallback(tenantId: string, q: string, k: number) {
    const terms = this.buildKeywordTerms(q);
    if (terms.length === 0) return [];

    const preciseQuery = terms.slice(0, 4).join(" ");
    const preciseHits = this.containsChinese(preciseQuery)
      ? await this.bm25Chinese(tenantId, preciseQuery, k)
      : await this.bm25English(tenantId, preciseQuery, k);
    if (preciseHits.length > 0) return preciseHits;

    const tsQuery = terms
      .map((term) => term.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, ""))
      .filter((term) => term.length >= 2)
      .slice(0, 8)
      .join(" | ");
    if (!tsQuery) return [];

    const rows = await this.db.query<any>(
      `SELECT c.id              AS "chunkId",
              COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
              COALESCE(c.content_id, c.document_id) AS "contentId",
              c.idx             AS idx,
              c.text            AS text,
              c.page            AS page,
              COALESCE(dc.title, d.title) AS "documentTitle",
              COALESCE(dc.mime, d.mime) AS mime,
              ts_rank_cd(c.tsv_zh, to_tsquery('zhcfg', $1)) +
              ts_rank_cd(c.tsv_simple, to_tsquery('simple', lower($1))) AS rank,
              c.text AS highlight
       FROM chunks c
       LEFT JOIN document_contents dc ON dc.id = c.content_id
       JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
       WHERE COALESCE(dc.tenant_id, d.tenant_id) = $2
         AND (
           c.tsv_zh @@ to_tsquery('zhcfg', $1)
           OR c.tsv_simple @@ to_tsquery('simple', lower($1))
         )
       ORDER BY rank DESC
       LIMIT $3`,
      [tsQuery, tenantId, k],
    );
    return rows.map((r) => this.mapRowToHit(r, "bm25"));
  }

  /**
   * 中文全文检索（使用 zhparser + zhcfg 配置）
   */
  private async bm25Chinese(tenantId: string, q: string, k: number): Promise<SearchHit[]> {
    try {
      const rows = await this.db.query<any>(
        `SELECT c.id              AS "chunkId",
                COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
                COALESCE(c.content_id, c.document_id) AS "contentId",
                c.idx             AS idx,
                c.text            AS text,
                c.page            AS page,
                COALESCE(dc.title, d.title) AS "documentTitle",
                COALESCE(dc.mime, d.mime) AS mime,
                ts_rank_cd(c.tsv_zh, plainto_tsquery('zhcfg', $1)) AS rank,
                ts_headline('zhcfg', c.text, plainto_tsquery('zhcfg', $1),
                  'StartSel=<mark>,StopSel=</mark>,MaxWords=50,MinWords=10,ShortWord=1,HighlightAll=0') AS highlight
         FROM chunks c
         LEFT JOIN document_contents dc ON dc.id = c.content_id
         JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
         WHERE COALESCE(dc.tenant_id, d.tenant_id) = $2
           AND c.tsv_zh @@ plainto_tsquery('zhcfg', $1)
         ORDER BY rank DESC
         LIMIT $3`,
        [q, tenantId, k],
      );
      return rows.map((r) => this.mapRowToHit(r, "bm25"));
    } catch (e: any) {
      this.logger.warn(`中文检索失败，尝试降级到通用分词: ${e.message}`);
      return this.bm25English(tenantId, q, k);
    }
  }

  /**
   * 英文/通用全文检索（使用 simple 分词配置）
   */
  private async bm25English(tenantId: string, q: string, k: number): Promise<SearchHit[]> {
    const rows = await this.db.query<any>(
      `SELECT c.id              AS "chunkId",
              COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
              COALESCE(c.content_id, c.document_id) AS "contentId",
              c.idx             AS idx,
              c.text            AS text,
              c.page            AS page,
              COALESCE(dc.title, d.title) AS "documentTitle",
              COALESCE(dc.mime, d.mime) AS mime,
              ts_rank_cd(c.tsv_simple, plainto_tsquery('simple', lower($1))) AS rank,
              ts_headline('simple', c.text, plainto_tsquery('simple', lower($1)),
                'StartSel=<mark>,StopSel=</mark>,MaxWords=50,MinWords=10') AS highlight
       FROM chunks c
       LEFT JOIN document_contents dc ON dc.id = c.content_id
       JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
       WHERE COALESCE(dc.tenant_id, d.tenant_id) = $2
         AND c.tsv_simple @@ plainto_tsquery('simple', lower($1))
       ORDER BY rank DESC
       LIMIT $3`,
      [q, tenantId, k],
    );
    return rows.map((r) => this.mapRowToHit(r, "bm25"));
  }

  /**
   * 向量检索
   */
  private async vector(tenantId: string, q: string, k: number): Promise<SearchHit[]> {
    const embedding = await this.embeddings.embedOne(q, "query");
    const vec = `[${embedding.join(",")}]`;
    const rows = await this.db.query<any>(
      `SELECT c.id              AS "chunkId",
              COALESCE(dc.canonical_document_id, c.document_id) AS "documentId",
              COALESCE(c.content_id, c.document_id) AS "contentId",
              c.idx             AS idx,
              c.text            AS text,
              c.page            AS page,
              COALESCE(dc.title, d.title) AS "documentTitle",
              COALESCE(dc.mime, d.mime) AS mime,
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM chunks c
       LEFT JOIN document_contents dc ON dc.id = c.content_id
       JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
       WHERE COALESCE(dc.tenant_id, d.tenant_id) = $2 AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      [vec, tenantId, k],
    );
    return rows.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      contentId: r.contentId,
      documentTitle: r.documentTitle,
      mime: r.mime,
      idx: r.idx,
      text: r.text,
      highlight: r.text.slice(0, 200),
      score: Number(r.similarity) || 0,
      sources: ["vector"] as const,
      page: r.page ?? null,
    }));
  }

  private async safeVector(tenantId: string, q: string, k: number): Promise<SearchHit[]> {
    try {
      return await this.vector(tenantId, q, k);
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
  private async trgmSearch(tenantId: string, q: string, k: number): Promise<SearchHit[]> {
    try {
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
                similarity(c.text, $1) AS similarity,
                ts_headline('simple', c.text, plainto_tsquery('simple', $1),
                  'StartSel=<mark>,StopSel=</mark>,MaxWords=50,MinWords=10') AS highlight
         FROM chunks c
         LEFT JOIN document_contents dc ON dc.id = c.content_id
         JOIN documents d ON d.id = COALESCE(dc.canonical_document_id, c.document_id)
         WHERE COALESCE(dc.tenant_id, d.tenant_id) = $2
           AND c.text % $1
         ORDER BY similarity DESC
         LIMIT $3`,
        [q, tenantId, k],
      );
      return rows.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        contentId: r.contentId,
        documentTitle: r.documentTitle,
        mime: r.mime,
        idx: r.idx,
        text: r.text,
        highlight: r.highlight || r.text.slice(0, 200),
        score: Number(r.similarity) || 0,
        sources: ["trgm"] as const,
        page: r.page ?? null,
      }));
    } catch (e: any) {
      this.logger.warn(`Trigram 检索失败: ${e.message}`);
      return [];
    }
  }

  /**
   * 将数据库行映射为 SearchHit
   */
  private mapRowToHit(r: any, source: "bm25" | "vector"): SearchHit {
    return {
      chunkId: r.chunkId,
      documentId: r.documentId,
      contentId: r.contentId,
      documentTitle: r.documentTitle,
      mime: r.mime || "application/pdf",
      idx: r.idx,
      text: r.text,
      highlight: r.highlight || r.text.slice(0, 200),
      score: Number(r.rank) || 0,
      sources: [source],
      page: r.page ?? null,
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
      mime: r.mime || "application/pdf",
      idx: r.idx,
      text: r.text,
      highlight: r.highlight || r.text.slice(0, 200),
      score: Number(r.similarity) || 0,
      sources: ["trgm"],
      page: r.page ?? null,
    };
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
