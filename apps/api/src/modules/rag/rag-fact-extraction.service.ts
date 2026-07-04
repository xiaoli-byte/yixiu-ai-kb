import { Injectable, Logger } from "@nestjs/common";
import { LlmService, type ChatMessage } from "../llm/llm.service";
import type { SearchHit } from "../search/search.service";
import { RagProfileService } from "./rag-profile.service";
import type {
  FactExtractionChunk,
  RagDomain,
  StructuredFactInput,
} from "./rag.types";

const SUPPORTED_FACT_DOMAINS: RagDomain[] = [
  "ecommerce",
  "ktv",
  "foreign_trade",
  "crm",
  "resume",
  "medical",
  "collection",
  "default",
];

@Injectable()
export class RagFactExtractionService {
  private readonly logger = new Logger(RagFactExtractionService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly profiles: RagProfileService,
  ) {}

  async extractDocumentFacts(opts: {
    tenantId: string;
    documentId: string;
    title: string;
    mime: string;
    fullText: string;
    chunks: FactExtractionChunk[];
  }): Promise<StructuredFactInput[]> {
    const domainHint = this.profiles.classifyText(`${opts.title}\n${opts.fullText.slice(0, 4000)}`);
    const llmFacts = await this.extractWithLlm({
      tenantId: opts.tenantId,
      documentId: opts.documentId,
      domainHint,
      title: opts.title,
      chunks: opts.chunks,
    });
    const heuristicFacts = this.extractHeuristicEmploymentFacts({
      tenantId: opts.tenantId,
      documentId: opts.documentId,
      chunks: opts.chunks,
    });
    return this.dedupeFacts([...llmFacts, ...heuristicFacts]).slice(0, 100);
  }

  async extractFactsFromSearchHits(opts: {
    tenantId: string;
    domainHint: RagDomain;
    hits: SearchHit[];
  }): Promise<StructuredFactInput[]> {
    if (opts.hits.length === 0) return [];
    const chunks = opts.hits.map((hit) => ({
      id: hit.chunkId,
      text: hit.text,
      page: hit.page,
      documentId: hit.documentId,
      documentTitle: hit.documentTitle,
    }));
    const llmFacts = await this.extractWithLlm({
      tenantId: opts.tenantId,
      documentId: opts.hits[0].documentId,
      domainHint: opts.domainHint,
      title: opts.hits[0].documentTitle,
      chunks,
    });
    const heuristicFacts = this.extractHeuristicEmploymentFacts({
      tenantId: opts.tenantId,
      documentId: opts.hits[0].documentId,
      chunks,
    });
    return this.dedupeFacts([...llmFacts, ...heuristicFacts]).slice(0, 50);
  }

  private async extractWithLlm(opts: {
    tenantId: string;
    documentId: string;
    domainHint: RagDomain;
    title: string;
    chunks: Array<FactExtractionChunk & { documentId?: string; documentTitle?: string }>;
  }): Promise<StructuredFactInput[]> {
    if (this.llm.isMock || opts.chunks.length === 0) return [];

    const chunkMap = new Map(opts.chunks.map((chunk) => [chunk.id, chunk]));
    const sample = opts.chunks
      .slice(0, 30)
      .map(
        (chunk) =>
          `[chunkId=${chunk.id}${chunk.page ? ` page=${chunk.page}` : ""}]\n${this.compactText(chunk.text, 900)}`,
      )
      .join("\n\n---\n\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是多行业 RAG 结构化事实抽取器。只抽取原文中明确出现的事实，不推断、不补全。输出必须是可直接 JSON.parse 的严格 JSON，不要 Markdown、注释、尾逗号或省略号；字符串中的双引号必须转义。",
      },
      {
        role: "user",
        content: `文档标题：${opts.title}
领域提示：${opts.domainHint}

请抽取面向电商、KTV、外贸、CRM，以及简历回归场景的结构化事实。

允许的 domain：
- ecommerce：商品、SKU/SPU、型号、品牌、规格、价格、库存、促销、售后政策、适配性
- ktv：门店、包厢/房型、套餐、酒水、价格、低消、营业时间、预订规则、会员权益
- foreign_trade：外贸产品、报价、贸易术语、付款方式、交期、物流/运输、报关、认证、客户要求
- crm：客户、联系人、线索、商机、销售阶段、跟进记录、工单、合同、交互记录
- resume：工作经历、公司、职位、起止日期、项目经历
- medical / collection：仅当原文明确属于这些行业时抽取
- default：重要但无法归类的文档事实

输出 JSON 结构：
{"facts":[{"domain":"ecommerce|ktv|foreign_trade|crm|resume|medical|collection|default","entityType":"...","entityName":"...","chunkId":"...","attributes":{},"confidence":0.0,"sourceText":"原文证据短句"}]}

要求：
- entityType 使用上面行业语义里的英文小写蛇形命名，例如 sku、room_type、incoterm、opportunity、employment
- attributes 放结构化字段，例如 price、currency、startDate、endDate、phone、stage、paymentTerm、leadTime
- sourceText 必须是原文片段，不能超过 160 字；不要包含换行，原文里的英文双引号请改用中文引号或转义
- 最多 40 条 facts

文本：
${sample}`,
      },
    ];

    try {
      const raw = await this.llm.chat(messages, { temperature: 0, topP: 0.2, maxTokens: 2500 });
      const parsed = this.parseJson(raw);
      const facts: unknown[] = Array.isArray(parsed?.facts) ? parsed.facts : [];
      return facts
        .map((fact) => this.normalizeLlmFact(fact, opts.tenantId, opts.documentId, chunkMap))
        .filter((fact): fact is StructuredFactInput => Boolean(fact));
    } catch (e: any) {
      this.logger.warn(`结构化事实抽取失败: ${e.message}`);
      return [];
    }
  }

  private normalizeLlmFact(
    fact: any,
    tenantId: string,
    fallbackDocumentId: string,
    chunks: Map<string, FactExtractionChunk & { documentId?: string }>,
  ): StructuredFactInput | null {
    const domain = this.normalizeDomain(fact?.domain);
    const entityType = this.cleanValue(fact?.entityType || fact?.entity_type);
    const entityName = this.cleanValue(fact?.entityName || fact?.entity_name);
    const sourceText = this.compactText(this.cleanValue(fact?.sourceText || fact?.source_text), 240);
    if (!domain || !entityType || !entityName || !sourceText) return null;

    const chunk = chunks.get(this.cleanValue(fact?.chunkId || fact?.chunk_id)) || this.findChunk(sourceText, chunks);
    return {
      tenantId,
      documentId: chunk?.documentId || fallbackDocumentId,
      chunkId: chunk?.id || null,
      domain,
      entityType,
      entityName,
      attributes: this.normalizeAttributes(fact?.attributes),
      confidence: this.normalizeConfidence(fact?.confidence),
      sourceText,
    };
  }

  private extractHeuristicEmploymentFacts(opts: {
    tenantId: string;
    documentId: string;
    chunks: Array<FactExtractionChunk & { documentId?: string }>;
  }): StructuredFactInput[] {
    const facts: StructuredFactInput[] = [];
    const date = String.raw`((?:19|20)\d{2}(?:[./年-]\d{1,2})?)`;
    const end = String.raw`(至今|现在|目前|Present|present|${date})`;
    const company = String.raw`([\u4e00-\u9fa5A-Za-z0-9（）()·&.\-]{2,50}(?:公司|集团|科技|有限|有限公司|股份|商贸|贸易|KTV|娱乐))`;
    const dateFirst = new RegExp(`${date}\\s*(?:[-~至—–到]+)\\s*${end}[\\s\\S]{0,80}?${company}`, "g");
    const companyFirst = new RegExp(`${company}[\\s\\S]{0,80}?${date}\\s*(?:[-~至—–到]+)\\s*${end}`, "g");

    for (const chunk of opts.chunks.slice(0, 40)) {
      const text = chunk.text;
      for (const match of text.matchAll(dateFirst)) {
        const sourceText = this.compactText(match[0], 220);
        const companyName = this.cleanValue(match[4]);
        if (!companyName) continue;
        facts.push({
          tenantId: opts.tenantId,
          documentId: chunk.documentId || opts.documentId,
          chunkId: chunk.id,
          domain: "resume",
          entityType: "employment",
          entityName: companyName,
          attributes: {
            startDate: this.normalizeDateText(match[1]),
            endDate: this.normalizeDateText(match[2]),
          },
          confidence: 0.72,
          sourceText,
        });
      }
      for (const match of text.matchAll(companyFirst)) {
        const sourceText = this.compactText(match[0], 220);
        const companyName = this.cleanValue(match[1]);
        if (!companyName) continue;
        facts.push({
          tenantId: opts.tenantId,
          documentId: chunk.documentId || opts.documentId,
          chunkId: chunk.id,
          domain: "resume",
          entityType: "employment",
          entityName: companyName,
          attributes: {
            startDate: this.normalizeDateText(match[2]),
            endDate: this.normalizeDateText(match[3]),
          },
          confidence: 0.7,
          sourceText,
        });
      }
    }

    return this.dedupeFacts(facts);
  }

  private dedupeFacts(facts: StructuredFactInput[]) {
    const seen = new Set<string>();
    const result: StructuredFactInput[] = [];
    for (const fact of facts) {
      const key = [
        fact.domain,
        fact.entityType,
        fact.entityName,
        fact.chunkId || "",
        this.compactText(fact.sourceText, 80),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(fact);
    }
    return result;
  }

  private normalizeDomain(value: unknown): RagDomain | null {
    const domain = this.cleanValue(value) as RagDomain;
    return SUPPORTED_FACT_DOMAINS.includes(domain) ? domain : null;
  }

  private normalizeAttributes(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    return {};
  }

  private normalizeConfidence(value: unknown) {
    const confidence = Number(value);
    if (!Number.isFinite(confidence)) return 0.6;
    return Math.max(0, Math.min(1, confidence));
  }

  private normalizeDateText(value: unknown) {
    const text = this.cleanValue(value);
    if (!text) return "";
    if (/^(至今|现在|目前|present)$/i.test(text)) return "present";
    return text.replace(/[年月.]/g, "-").replace(/日/g, "").replace(/-+$/g, "");
  }

  private findChunk<T extends FactExtractionChunk>(sourceText: string, chunks: Map<string, T>) {
    if (!sourceText) return undefined;
    return [...chunks.values()].find(
      (chunk) => chunk.text.includes(sourceText) || sourceText.includes(this.compactText(chunk.text, 80)),
    );
  }

  private parseJson(raw: string): { facts?: unknown[] } | null {
    const text = this.stripJsonEnvelope(raw);
    const json = this.extractBalancedBlock(text, text.indexOf("{"), "{", "}");
    if (!json) {
      return this.parseLooseFacts(text);
    }

    const candidates = [json, this.cleanJsonText(json)];
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as { facts?: unknown[] };
      } catch (e) {
        lastError = e;
      }
    }

    const salvaged = this.parseLooseFacts(json);
    if (salvaged?.facts?.length) {
      this.logger.warn(
        `结构化事实 JSON 不完整，已降级逐条解析出 ${salvaged.facts.length} 条 facts`,
      );
      return salvaged;
    }

    throw lastError instanceof Error ? lastError : new Error("结构化事实 JSON 解析失败");
  }

  private stripJsonEnvelope(raw: string) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    return (fenced || raw).trim();
  }

  private cleanJsonText(text: string) {
    return text
      .replace(/^\uFEFF/, "")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();
  }

  private parseLooseFacts(text: string): { facts: unknown[] } | null {
    const factsKey = text.search(/["']?facts["']?\s*:/i);
    if (factsKey < 0) return null;
    const arrayStart = text.indexOf("[", factsKey);
    if (arrayStart < 0) return null;

    const arrayText = this.extractBalancedBlock(text, arrayStart, "[", "]") || text.slice(arrayStart);
    const facts: unknown[] = [];
    let cursor = 0;

    while (cursor < arrayText.length) {
      const objectStart = arrayText.indexOf("{", cursor);
      if (objectStart < 0) break;
      const objectText = this.extractBalancedBlock(arrayText, objectStart, "{", "}");
      if (!objectText) break;

      for (const candidate of [objectText, this.cleanJsonText(objectText)]) {
        try {
          facts.push(JSON.parse(candidate));
          break;
        } catch {
          // Try the next cleaned candidate; skip the object if both fail.
        }
      }
      cursor = objectStart + objectText.length;
    }

    return facts.length > 0 ? { facts } : null;
  }

  private extractBalancedBlock(
    text: string,
    start: number,
    open: "{" | "[",
    close: "}" | "]",
  ): string | null {
    if (start < 0 || text[start] !== open) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      }

      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === open) depth += 1;
      if (ch === close) depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }

    return null;
  }

  private cleanValue(value: unknown) {
    return String(value ?? "").trim();
  }

  private compactText(text: string, maxLength: number) {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length > maxLength ? compact.slice(0, maxLength) : compact;
  }
}
