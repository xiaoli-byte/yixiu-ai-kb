import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);
  private apiKey = "";
  private baseUrl = "";
  private model = "";
  private dim = 1024;
  private mock = false;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit() {
    const dashscope = this.config.dashscope;
    this.apiKey = dashscope.apiKey;
    this.baseUrl = dashscope.baseUrl;
    this.model = dashscope.embedModel;
    this.dim = dashscope.embedDim;
    this.mock = dashscope.embedMock || this.apiKey.startsWith("sk-replace");
    if (this.mock) {
      this.logger.warn("DashScope API key 未配置或启用了 mock 模式，Embeddings 将返回零向量（仅用于联调）");
    } else {
      this.logger.log(`Embeddings 客户端就绪: model=${this.model}, dim=${this.dim}`);
    }
  }

  get dimension() {
    return this.dim;
  }

  /**
   * 批量 embedding。DashScope 单次最多 10 条。
   * textType:
   *   - "document": 入库时调用(默认)
   *   - "query":    检索时对用户 query 调,向量空间更接近
   */
  async embedBatch(texts: string[], textType: "document" | "query" = "document"): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.mock) {
      return texts.map(() => new Array(this.dim).fill(0));
    }
    const batchSize = 10;
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const res = await this.callOnce(batch, textType);
      out.push(...res);
    }
    return out;
  }

  async embedOne(text: string, textType: "document" | "query" = "document"): Promise<number[]> {
    const [v] = await this.embedBatch([text], textType);
    return v;
  }

  private async callOnce(input: string[], textType: "document" | "query" = "document"): Promise<number[][]> {
    const url = `${this.baseUrl}/services/embeddings/text-embedding/text-embedding`;
    const body = {
      model: this.model,
      input: { texts: input },
      parameters: { dimension: this.dim, text_type: textType },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DashScope Embeddings 失败: ${res.status} ${errText}`);
    }
    const data: any = await res.json();
    const embeddings: number[][] = data?.output?.embeddings?.map((e: any) => e.embedding) || [];
    if (embeddings.length === 0) {
      throw new Error("DashScope 返回为空");
    }
    return embeddings;
  }
}
