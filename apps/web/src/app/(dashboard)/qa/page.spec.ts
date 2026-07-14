import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 与 search/page.spec.ts 同风格：对源码关键特征做字符串断言，覆盖流式状态竞态守卫。
// 统一归一化行尾，避免 Windows CRLF 影响跨行匹配。
const pageSource = readFileSync(
  join(process.cwd(), "apps/web/src/app/(dashboard)/qa/page.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("QA 页面流式状态竞态守卫", () => {
  it("用自增请求序号做会话归属守卫：发起时捕获、完成时比对", () => {
    expect(pageSource).toContain("const requestSeqRef = useRef(0);");
    expect(pageSource).toContain("const mySeq = ++requestSeqRef.current;");
    expect(pageSource).toContain("const startActiveId = activeId;");
    expect(pageSource).toContain("const superseded = mySeq !== requestSeqRef.current;");
    // 发起时以捕获的 activeId 作为会话上下文传入 ask
    expect(pageSource).toContain("ask({ conversationId: startActiveId, question: q, accessToken })");
  });

  it("用户已切走时（done/aborted）只刷新列表，不 append、不 setActiveId（缺陷 B）", () => {
    expect(pageSource).toContain("if (superseded) {");
    // 守卫块内紧跟 loadConversations 后 return，不回填当前 UI
    expect(pageSource).toMatch(/if \(superseded\) \{[\s\S]{0,140}?await loadConversations\(\);\s*\n\s*return;/);
    // done 分支改用发起时捕获的 startActiveId 兜底，不再用实时 activeId（会把界面拽回旧会话）
    expect(pageSource).toContain("const convId = result.conversationId ?? startActiveId;");
    expect(pageSource).not.toContain("const convId = result.conversationId ?? activeId;");
  });

  it("aborted 归属未变时落 conversationId 并刷新列表，保留 stopped 部分消息（缺陷 A）", () => {
    // 首问被停止也能把已知 conversationId 落到 activeId，下一问继续同一会话
    expect(pageSource).toContain("setActiveId(result.conversationId ?? startActiveId);");
    expect(pageSource).toContain("stopped: true,");
  });

  it("切换 / 新建会话前先 stop() 中止在途流并作废归属（缺陷 B）", () => {
    // openConversation 的第一条语句就是 stop()
    expect(pageSource).toMatch(/async function openConversation\(id: string\) \{\n\s*stop\(\);/);
    // newConversation 的第一条语句就是 stop()
    expect(pageSource).toMatch(/function newConversation\(\) \{\n\s*stop\(\);/);
    // 两个切换入口都自增序号，作废在途请求
    const bumpCount = pageSource.split("requestSeqRef.current += 1;").length - 1;
    expect(bumpCount).toBeGreaterThanOrEqual(2);
    // 删除当前会话委托 newConversation（其中已含 stop()），满足“先 stop 再切换”
    expect(pageSource).toContain("if (activeId === id) newConversation();");
  });

  it("error 分支保持恢复输入内容的现状行为", () => {
    expect(pageSource).toContain("setError(result.message);");
    expect(pageSource).toContain("setInput(q);");
  });
});
