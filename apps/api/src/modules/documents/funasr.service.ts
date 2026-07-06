import { Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service";

interface FunAsrRecognizeResponse {
  text?: string;
  code?: number;
  msg?: string;
  detail?: unknown;
}

@Injectable()
export class FunAsrService {
  private readonly logger = new Logger(FunAsrService.name);

  constructor(private readonly config: AppConfigService) {}

  async transcribe(buffer: Buffer, mime: string, filename: string): Promise<string> {
    const url = this.buildRecognizeUrl();
    const { timeoutMs } = this.config.asr;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: mime || "application/octet-stream",
      });
      form.append("audio", blob, filename || "audio.wav");

      const response = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      const body = await response.text();
      const data = this.parseResponseBody(body);

      if (!response.ok) {
        const detail = typeof data.detail === "string" ? `: ${data.detail}` : "";
        throw new Error(`${data.msg || body || `HTTP ${response.status}`}${detail}`);
      }
      if (typeof data.code === "number" && data.code !== 0) {
        throw new Error(data.msg || `FunASR 返回错误码 ${data.code}`);
      }

      const text = data.text?.trim();
      if (!text) {
        throw new Error("语音识别结果为空");
      }

      this.logger.debug(`FunASR 转写成功，文本长度: ${text.length}`);
      return text;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error(`FunASR 转写超时（${timeoutMs}ms）`);
      }
      const reason =
        e?.message === "fetch failed"
          ? `无法连接 ${url}，请先启动 I:\\ai-call\\services\\funasr-server`
          : e.message;
      throw new Error(`FunASR 转写失败: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRecognizeUrl(): string {
    const baseUrl = this.config.asr.httpUrl;
    const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL("recognize", normalized).toString();
  }

  private parseResponseBody(body: string): FunAsrRecognizeResponse {
    if (!body) return {};
    try {
      return JSON.parse(body) as FunAsrRecognizeResponse;
    } catch {
      return { msg: body };
    }
  }
}
