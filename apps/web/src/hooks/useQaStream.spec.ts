import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 与 search/page.spec.ts 同风格：仓库前端无交互测试，改为对源码关键特征做字符串断言。
// 统一归一化行尾，避免 Windows CRLF 影响跨行匹配。
const hookSource = readFileSync(
  join(process.cwd(), "apps/web/src/hooks/useQaStream.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("useQaStream 流式状态与会话归属", () => {
  it("处理 conversation 事件，把 conversationId 记入与 done 同源的局部变量（缺陷 A）", () => {
    expect(hookSource).toContain('evt.type === "conversation"');
    expect(hookSource).toContain("if (evt.conversationId) convId = evt.conversationId;");
    // convId 提升到 try 外层，conversation / done 都写它，abort 时 catch 也能读到
    expect(hookSource).toMatch(/let convId: string \| null = conversationId;\s+try \{/);
    // done 分支同样写入同一个 convId
    expect(hookSource).toMatch(/evt\.type === "done"[\s\S]{0,80}?convId = evt\.conversationId;/);
  });

  it("QaStreamAbortedResult 携带 conversationId，aborted 返回带上已知 convId（缺陷 A）", () => {
    // 接口新增 conversationId 字段（限定在该 interface 花括号内匹配）
    expect(hookSource).toMatch(
      /export interface QaStreamAbortedResult \{[^}]*conversationId: string \| null;[^}]*\}/,
    );
    expect(hookSource).toContain(
      'return { status: "aborted", conversationId: convId, content: assembled, citations };',
    );
  });

  it("修正解析失败注释：如实丢弃罕见异常事件，删除“等待拼接”与特定错误文案判断（缺陷 C）", () => {
    expect(hookSource).not.toContain("等待后续数据拼接");
    expect(hookSource).not.toContain("Unexpected end of JSON input");
    expect(hookSource).toContain("SSE 事件解析失败，已丢弃该行");
    // 不再有“判断错误消息文案后再决定是否记录”的分支
    expect(hookSource).not.toContain('(e as Error).message !==');
  });

  it("保持既有 stop / streaming / streamingText 语义不回归", () => {
    expect(hookSource).toContain("const stop = useCallback(() => {");
    expect(hookSource).toContain("abortRef.current?.abort();");
    expect(hookSource).toContain("setStreaming(true);");
    expect(hookSource).toContain("setStreamingText(assembled);");
    expect(hookSource).toContain("setStreaming(false);");
  });
});
