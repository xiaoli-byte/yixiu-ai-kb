import { Injectable, Logger } from "@nestjs/common";
import * as mammoth from "mammoth";
import * as xlsx from "xlsx";

@Injectable()
export class OfficeParserService {
  private readonly logger = new Logger(OfficeParserService.name);

  /**
   * 解析 Office 文档
   * @param buffer 文件 buffer
   * @param mime MIME 类型
   * @param filename 文件名
   * @returns 解析后的文本
   */
  async parse(buffer: Buffer, mime: string, filename: string): Promise<string> {
    const ext = this.getExtension(filename).toLowerCase();

    switch (ext) {
      case ".docx":
      case ".docm":
        return this.parseDocx(buffer);
      case ".doc":
        return this.parseDoc(buffer, mime);
      case ".xlsx":
      case ".xls":
      case ".xlsm":
        return this.parseExcel(buffer);
      case ".pptx":
      case ".pptm":
        return this.parsePptx(buffer);
      case ".ppt":
        return this.parsePpt(buffer, mime);
      default:
        throw new Error(`不支持的 Office 文档格式: ${ext}`);
    }
  }

  /**
   * 获取文件扩展名
   */
  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    return lastDot >= 0 ? filename.slice(lastDot) : "";
  }

  /**
   * 解析 Word (.docx) - 基于 XML 格式
   */
  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;

      if (!text || !text.trim()) {
        throw new Error("Word 文档内容为空");
      }

      this.logger.debug(`Docx 解析成功，文本长度: ${text.length}`);
      return text;
    } catch (e: any) {
      if (e.message?.includes("Could not find")) {
        throw new Error("Word 文档已损坏或格式不兼容");
      }
      throw new Error(`Word 文档解析失败: ${e.message}`);
    }
  }

  /**
   * 解析 Word (.doc) - 旧版格式，需要 LibreOffice 转换
   * 注意：需要服务器安装 LibreOffice
   */
  private async parseDoc(buffer: Buffer, mime: string): Promise<string> {
    // 尝试使用 LibreOffice 命令行工具转换
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");

    const tmpDir = os.tmpdir();
    const inputFile = path.join(tmpDir, `doc_${Date.now()}.doc`);
    const outputFile = path.join(tmpDir, `doc_${Date.now()}.docx`);

    try {
      // 写入临时文件
      fs.writeFileSync(inputFile, buffer);

      // 使用 LibreOffice 转换为 docx
      // macOS: /Applications/LibreOffice.app/Contents/MacOS/soffice
      // Linux: libreoffice
      // Windows: "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
      const sofficePaths = [
        "soffice", // Linux
        "libreoffice", // Linux
        "/Applications/LibreOffice.app/Contents/MacOS/soffice", // macOS
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe", // Windows
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe", // Windows 32-bit
      ];

      let converted = false;
      for (const soffice of sofficePaths) {
        try {
          await execAsync(`"${soffice}" --headless --convert-to docx --outdir "${tmpDir}" "${inputFile}"`, {
            timeout: 30000,
          });
          converted = true;
          break;
        } catch {
          // 尝试下一个路径
        }
      }

      if (!converted) {
        throw new Error(
          "旧版 Word 文档 (.doc) 需要 LibreOffice 支持。请将文档另存为 .docx 格式后重试。",
        );
      }

      // 读取转换后的文件
      const convertedBuffer = fs.readFileSync(outputFile);

      // 解析 docx
      const result = await mammoth.extractRawText({ buffer: convertedBuffer });
      return result.value;
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      } catch {
        // 忽略清理错误
      }
    }
  }

  /**
   * 解析 Excel (.xlsx/.xls)
   */
  private parseExcel(buffer: Buffer): string {
    try {
      const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
      const texts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const range = xlsx.utils.decode_range(worksheet["!ref"] || "A1");

        texts.push(`=== 工作表: ${sheetName} ===`);

        // 遍历所有单元格
        for (let R = range.s.r; R <= range.e.r; R++) {
          const rowTexts: string[] = [];
          for (let C = range.s.c; C <= range.e.c; C++) {
            const cellAddress = xlsx.utils.encode_cell({ r: R, c: C });
            const cell = worksheet[cellAddress];

            if (cell) {
              let cellText = "";
              switch (cell.type) {
                case "s": // 字符串
                  cellText = cell.v?.toString() || "";
                  break;
                case "n": // 数字
                  cellText = cell.v?.toString() || "";
                  break;
                case "b": // 布尔
                  cellText = cell.v ? "TRUE" : "FALSE";
                  break;
                case "d": // 日期
                  cellText = cell.v?.toString() || "";
                  break;
                case "e": // 错误
                  cellText = "";
                  break;
                default:
                  cellText = cell.w?.toString() || cell.v?.toString() || "";
              }
              if (cellText.trim()) {
                rowTexts.push(cellText.trim());
              }
            }
          }
          // 只保留有内容的行
          if (rowTexts.length > 0) {
            texts.push(rowTexts.join(" | "));
          }
        }

        texts.push(""); // 空行分隔工作表
      }

      const result = texts.join("\n").trim();
      if (!result) {
        throw new Error("Excel 文档内容为空");
      }

      this.logger.debug(`Excel 解析成功，文本长度: ${result.length}`);
      return result;
    } catch (e: any) {
      throw new Error(`Excel 文档解析失败: ${e.message}`);
    }
  }

  /**
   * 解析 PowerPoint (.pptx) - 基于 XML 格式
   */
  private async parsePptx(buffer: Buffer): Promise<string> {
    try {
      // pptx 基于 ZIP + XML，需要手动解析
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      await zip.loadAsync(buffer);

      const texts: string[] = [];
      const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/;

      // 获取所有幻灯片
      const slideFiles = Object.keys(zip.files)
        .filter((name) => slideRegex.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(slideRegex)?.[1] || "0");
          const numB = parseInt(b.match(slideRegex)?.[1] || "0");
          return numA - numB;
        });

      if (slideFiles.length === 0) {
        throw new Error("PPT 文档中没有找到幻灯片");
      }

      for (const slidePath of slideFiles) {
        const slideNum = slidePath.match(slideRegex)?.[1];
        const slideXml = await zip.file(slidePath)?.async("string");

        if (slideXml) {
          texts.push(`=== 幻灯片 ${slideNum} ===`);

          // 提取所有 <a:t> 标签中的文本
          const textMatches = slideXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g);
          const slideTexts: string[] = [];

          for (const match of textMatches) {
            const text = match[1]?.trim();
            if (text) {
              slideTexts.push(text);
            }
          }

          if (slideTexts.length > 0) {
            texts.push(slideTexts.join(" "));
          }
          texts.push("");
        }
      }

      const result = texts.join("\n").trim();
      if (!result) {
        throw new Error("PPT 文档内容为空");
      }

      this.logger.debug(`Pptx 解析成功，幻灯片数: ${slideFiles.length}`);
      return result;
    } catch (e: any) {
      if (e.message?.includes("not a zip")) {
        throw new Error("PPT 文档已损坏或格式不兼容");
      }
      throw new Error(`PPT 文档解析失败: ${e.message}`);
    }
  }

  /**
   * 解析 PowerPoint (.ppt) - 旧版格式，需要 LibreOffice 转换
   */
  private async parsePpt(buffer: Buffer, mime: string): Promise<string> {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");

    const tmpDir = os.tmpdir();
    const inputFile = path.join(tmpDir, `ppt_${Date.now()}.ppt`);
    const outputDir = path.join(tmpDir, `ppt_${Date.now()}`);

    try {
      // 写入临时文件
      fs.writeFileSync(inputFile, buffer);

      // 创建输出目录
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 使用 LibreOffice 转换
      const sofficePaths = [
        "soffice",
        "libreoffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      ];

      let converted = false;
      for (const soffice of sofficePaths) {
        try {
          await execAsync(
            `"${soffice}" --headless --convert-to pptx --outdir "${outputDir}" "${inputFile}"`,
            { timeout: 30000 },
          );
          converted = true;
          break;
        } catch {
          // 尝试下一个路径
        }
      }

      if (!converted) {
        throw new Error(
          "旧版 PPT 文档 (.ppt) 需要 LibreOffice 支持。请将文档另存为 .pptx 格式后重试。",
        );
      }

      // 查找转换后的文件
      const pptxFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith(".pptx"));
      if (pptxFiles.length === 0) {
        throw new Error("LibreOffice 转换失败");
      }

      const convertedBuffer = fs.readFileSync(path.join(outputDir, pptxFiles[0]));

      // 解析 pptx
      return this.parsePptx(convertedBuffer);
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(inputFile);
        if (fs.existsSync(outputDir)) {
          fs.rmSync(outputDir, { recursive: true, force: true });
        }
      } catch {
        // 忽略清理错误
      }
    }
  }

  /**
   * 检测是否为 Office 文档
   */
  isOfficeDocument(mime: string, filename: string): boolean {
    const ext = this.getExtension(filename).toLowerCase();
    const officeMimes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/vnd.ms-word.document.macroEnabled.12", // .docm
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
      "application/vnd.ms-powerpoint.presentation.macroEnabled.12", // .pptm
    ];

    return (
      officeMimes.includes(mime) ||
      [".docx", ".doc", ".docm", ".xlsx", ".xls", ".xlsm", ".pptx", ".ppt", ".pptm"].includes(ext)
    );
  }
}
