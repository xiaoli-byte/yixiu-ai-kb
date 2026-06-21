import { Injectable, Logger } from "@nestjs/common";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Jieba } from "@node-rs/jieba";

export interface Chunk {
  text: string;
  tokens: number;
  page?: number; // PDF 页码（1-based）
}

@Injectable()
export class TextChunkerService {
  private readonly logger = new Logger(TextChunkerService.name);
  private readonly jieba: Jieba;

  constructor() {
    this.jieba = new Jieba();
    this.logger.log("jieba 分词器初始化成功");
  }

  /**
   * 通用文本分块
   */
  async chunk(text: string, targetSize = 500, overlap = 50): Promise<Chunk[]> {
    const splitter = this._createSplitter(targetSize, overlap);
    const docs = await splitter.createDocuments([text]);
    return docs.map((doc) => ({
      text: doc.pageContent,
      tokens: this.estimateTokens(doc.pageContent),
    }));
  }

  /**
   * 按页分块（保留页码）
   */
  async chunkPages(
    pages: { page: number; text: string }[],
    targetSize = 500,
    overlap = 50,
  ): Promise<Chunk[]> {
    const splitter = this._createSplitter(targetSize, overlap);

    // 先拼接所有文本，同时记录每个字符属于哪一页
    let fullText = "";
    const pageMap: number[] = []; // pageMap[i] = 字符 i 所属的页码
    for (const { page, text } of pages) {
      const cleaned = this.normalizeText(text);
      if (!cleaned) continue;
      fullText += cleaned + "\n\n";
      pageMap.push(...new Array(cleaned.length + 2).fill(page));
    }

    if (!fullText.trim()) return [];

    const docs = await splitter.createDocuments([fullText]);

    // 为每个 chunk 分配页码（取 chunk 第一个字符对应的 pageMap 值）
    return docs.map((doc) => {
      const startIdx = fullText.indexOf(doc.pageContent);
      const page = pageMap[startIdx] ?? 1;
      return { text: doc.pageContent, tokens: this.estimateTokens(doc.pageContent), page };
    });
  }

  /**
   * 创建针对中英文混合文本优化的 splitter
   * 关键优化：避免在逗号处截断，防止"AI智能催收外呼"等关键词被拦腰截断
   */
  private _createSplitter(chunkSize: number, chunkOverlap: number): RecursiveCharacterTextSplitter {
    return new RecursiveCharacterTextSplitter({
      separators: [
        "\n\n",   // 段落分隔（最强语义边界）
        "\n",     // 换行
        "。",     // 中文句号
        "！",     // 中文感叹号
        "？",     // 中文问号
        "．",     // 全角英文句号
        ". ",     // 英文句号+空格
        "；",     // 中文分号（比逗号更强的边界）
        "; ",     // 英文分号
        // 移除 "，" 和 ", " 作为分隔符，避免切断关键词
        // 例如 "AI智能催收外呼" 不应在中间被截断
        " ",      // 单词边界（仅在无法继续时使用）
        "",       // 按字符数强制截断（最后手段）
      ],
      chunkSize,
      chunkOverlap,
      lengthFunction: (text: string) => this.estimateTokens(text),
    });
  }

  /**
   * 分词（供外部调用）
   */
  tokenize(text: string, hmm = true): string[] {
    try {
      return this.jieba.cut(text, hmm);
    } catch {
      return text.split(/(?=[\u4e00-\u9fa5])|(?<=[\u4e00-\u9fa5])/u).filter(Boolean);
    }
  }

  private normalizeText(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  }

  estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    return Math.ceil(chineseChars * 0.5 + (otherChars - englishChars) * 1 + englishWords * 1.3);
  }
}
