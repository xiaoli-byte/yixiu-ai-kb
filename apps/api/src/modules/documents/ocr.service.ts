import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type OcrResponse = Record<string, unknown>;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private readonly config: ConfigService) {}

  async recognizeImage(buffer: Buffer, mime: string, filename: string): Promise<string> {
    const text = await this.recognizeViaPaddleOcr(buffer, mime, filename);
    const normalized = this.normalizeText(text);
    if (!normalized) {
      throw new Error("OCR 识别结果为空");
    }

    this.logger.debug(`OCR 识别成功，文本长度: ${normalized.length}`);
    return normalized;
  }

  private async recognizeViaPaddleOcr(buffer: Buffer, mime: string, filename: string): Promise<string> {
    const url = this.buildRecognizeUrl();
    const timeoutMs = Number(this.config.getOrThrow<string>("PADDLEOCR_TIMEOUT_MS"));
    const uploadField = this.config.getOrThrow<string>("PADDLEOCR_UPLOAD_FIELD");
    const language = this.config.getOrThrow<string>("PADDLEOCR_LANG");
    const languageField = this.config.getOrThrow<string>("PADDLEOCR_LANG_FIELD");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: mime || "application/octet-stream",
      });
      form.append(uploadField, blob, filename || "image.png");
      if (languageField.trim()) {
        form.append(languageField, language);
      }

      const response = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const body = await response.text();
      const data = this.parseResponseBody(body);

      if (!response.ok) {
        throw new Error(this.describeHttpError(response.status, data, body));
      }
      if (typeof data.code === "number" && data.code !== 0) {
        throw new Error(String(data.msg || data.message || `PaddleOCR 返回错误码 ${data.code}`));
      }

      const text = this.extractText(data);
      if (!text) {
        throw new Error(`PaddleOCR 服务未返回可识别文本: ${body.slice(0, 300)}`);
      }
      return text;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error(`PaddleOCR 服务超时（${timeoutMs}ms）`);
      }
      const reason =
        e?.message === "fetch failed"
          ? `无法连接 ${url}，请先启动 PaddleOCR 服务`
          : e.message;
      throw new Error(`PaddleOCR 识别失败: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRecognizeUrl(): string {
    return this.config.getOrThrow<string>("PADDLEOCR_HTTP_URL").trim();
  }

  private parseResponseBody(body: string): OcrResponse {
    if (!body) return {};
    try {
      const parsed = JSON.parse(body);
      return typeof parsed === "object" && parsed !== null ? parsed : { text: String(parsed) };
    } catch {
      return { text: body };
    }
  }

  private describeHttpError(status: number, data: OcrResponse, body: string): string {
    const message = data.msg || data.message || data.error || body || `HTTP ${status}`;
    const detail = data.detail ? `: ${String(data.detail)}` : "";
    return `${String(message)}${detail}`;
  }

  private extractText(data: unknown): string {
    return this.collectText(data).join("\n");
  }

  private collectText(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap((item) => this.collectText(item));

    const record = value as Record<string, unknown>;
    const texts: string[] = [];
    for (const key of ["text", "result", "content", "ocr_text", "recognized_text"]) {
      texts.push(...this.collectText(record[key]));
    }
    for (const key of ["data", "results", "lines", "pages", "items", "rec_texts"]) {
      texts.push(...this.collectText(record[key]));
    }
    return texts;
  }

  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }
}
