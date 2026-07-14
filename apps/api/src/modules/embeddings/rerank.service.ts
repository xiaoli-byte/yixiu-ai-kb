import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service";

export interface RerankResult {
  /** 原始 documents 数组中的下标 */
  index: number;
  /** 相关性分数（0-1，越大越相关） */
  score: number;
}

/**
 * DashScope gte-rerank 重排客户端。
 * 混合召回后的候选片段交给重排模型精排，失败时调用方应降级为原有排序。
 */
@Injectable()
export class RerankService implements OnModuleInit {
  private readonly logger = new Logger(RerankService.name);
  private apiKey = "";
  private baseUrl = "";
  private model = "";
  private mock = false;

  /** DashScope rerank 单次请求最多接受的文档数 */
  private readonly MAX_DOCUMENTS = 100;
  /** 单条文档送入重排的最大字符数（控制请求体大小） */
  private readonly MAX_DOC_CHARS = 2000;
  /** rerank HTTP 请求超时（毫秒），避免第三方挂起拖垮问答链路 */
  private readonly REQUEST_TIMEOUT_MS = 15_000;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    const dashscope = this.config.dashscope;
    this.apiKey = dashscope.apiKey;
    this.baseUrl = dashscope.baseUrl;
    this.model = dashscope.rerankModel;
    this.mock = dashscope.rerankMock || dashscope.llmMock || this.apiKey.startsWith("sk-replace");
    if (this.mock) {
      this.logger.warn("Rerank mock 模式：保持候选原始顺序");
    } else {
      this.logger.log(`Rerank 客户端就绪: model=${this.model}`);
    }
  }

  get isMock() {
    return this.mock;
  }

  /**
   * 对候选文档按 query 相关性重排，返回按分数降序的 (index, score) 列表。
   * mock 模式或调用失败时抛错/退化由调用方处理；这里失败直接 throw。
   */
  async rerank(query: string, documents: string[], topN?: number): Promise<RerankResult[]> {
    if (documents.length === 0) return [];
    if (this.mock) {
      return documents.slice(0, topN ?? documents.length).map((_, index) => ({
        index,
        score: 1 - index * 0.01,
      }));
    }

    const docs = documents
      .slice(0, this.MAX_DOCUMENTS)
      .map((doc) => doc.slice(0, this.MAX_DOC_CHARS));
    const url = `${this.baseUrl}/services/rerank/text-rerank/text-rerank`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: { query: query.slice(0, this.MAX_DOC_CHARS), documents: docs },
        parameters: {
          return_documents: false,
          top_n: Math.min(topN ?? docs.length, docs.length),
        },
      }),
      // 15s 超时兜底：第三方无响应时快速失败，由调用方降级为召回原序
      signal: AbortSignal.timeout(this.REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DashScope Rerank 失败: ${res.status} ${errText}`);
    }
    const data: any = await res.json();
    const results: RerankResult[] = (data?.output?.results || [])
      .map((item: any) => ({
        index: Number(item.index),
        score: Number(item.relevance_score) || 0,
      }))
      .filter((item: RerankResult) => Number.isInteger(item.index) && item.index >= 0);
    if (results.length === 0) {
      throw new Error("DashScope Rerank 返回空结果");
    }
    return results.sort((a, b) => b.score - a.score);
  }
}
