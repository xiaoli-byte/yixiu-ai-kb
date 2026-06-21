"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2, MessageSquare, Plus, Trash2, ChevronLeft, FileText, BookOpen, Quote, X, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, apiBaseUrl, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/store";
import qaApi from "@/services/qa";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
const PdfViewerModal = dynamic(() => import("@/components/PdfViewerModal"), { ssr: false });
const MarkdownPreviewModal = dynamic(() => import("@/components/MarkdownPreviewModal"), { ssr: false });

interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  mime: string;
  snippet: string;
  page: number | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export default function QaPage() {
  const { accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<{ id: string; title: string; page?: number } | null>(null);
  const [mdDoc, setMdDoc] = useState<{ id: string; title: string } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const isMarkdownDoc = (mime: string, title: string): boolean => {
    return mime.includes("markdown") || mime === "text/markdown" || title.toLowerCase().endsWith(".md");
  };

  const openDocument = useCallback((docId: string, title: string, mime: string, page?: number) => {
    if (isMarkdownDoc(mime, title)) {
      setMdDoc({ id: docId, title });
    } else {
      setPdfDoc({ id: docId, title, page });
    }
  }, []);

  const closeDocument = useCallback(() => {
    setPdfDoc(null);
    setMdDoc(null);
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // 自动调整 textarea 高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  async function loadConversations() {
    try {
      const list = await qaApi.conversationList();
      setConversations(list || []);
    } catch (e) {
      console.error("加载会话列表失败", e);
    }
  }

  async function openConversation(id: string) {
    try {
      setActiveId(id);
      const c = await qaApi.conversationGet(id);
      setMessages(c?.messages || []);
      setError(null);
    } catch (e) {
      console.error("加载会话失败", e);
    }
  }

  function newConversation() {
    setActiveId(null);
    setMessages([]);
    setStreamingText("");
    setStreamingCitations([]);
    setError(null);
  }

  async function deleteConversation(id: string) {
    try {
      await qaApi.conversationDelete(id);
      setConversations((cs) => cs.filter((c) => c.id !== id));
      if (activeId === id) newConversation();
    } catch (e) {
      console.error("删除失败", e);
    }
  }

  const send = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const q = input.trim();
    setInput("");
    setError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      role: "user",
      content: q,
      citations: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg]);
    setStreaming(true);
    setStreamingText("");
    setStreamingCitations([]);

    try {
      const res = await fetch(`${apiBaseUrl}/qa/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ conversationId: activeId, question: q }),
      });

      if (!res.ok || !res.body) {
        throw new ApiError(res.status, "REQUEST_FAILED", `请求失败: ${res.status}`);
      }

      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assembled = "";
      let convId = activeId;
      let messageId = "";
      let noRelevantResults = false;
      let citations: Citation[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "chunk") {
              assembled += evt.content;
              setStreamingText(assembled);
            } else if (evt.type === "citations") {
              citations = evt.citations || [];
              setStreamingCitations(citations);
            } else if (evt.type === "done") {
              convId = evt.conversationId;
              messageId = evt.messageId;
            } else if (evt.type === "error") {
              throw new Error(evt.message);
            } else if (evt.type === "no_results") {
              noRelevantResults = true;
            }
          } catch (e) {
            if ((e as Error).message !== "Unexpected end of JSON input") {
              console.error("SSE parse error", e);
            }
          }
        }
      }

      // 构建最终消息（注意：此时 citations 已在流式过程中被收集）
      const finalMsg: ChatMessage = {
        id: messageId || "ai-" + Date.now(),
        role: "assistant",
        content: assembled,
        citations,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, finalMsg]);
      setStreamingText("");
      setActiveId(convId);
      await loadConversations();
    } catch (e: any) {
      setError(e?.message || "发生错误，请重试");
      setMessages((m) => m.filter((x) => x.id !== tempUserMsg.id));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, activeId, accessToken]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 侧边栏 */}
      <aside
        className={cn(
          "shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden border-0",
        )}
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between min-w-[288px]">
          <span className="font-semibold text-sm">会话历史</span>
          <button
            className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
            onClick={newConversation}
          >
            <Plus size={12} /> 新建
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-8">
              暂无会话记录
            </div>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group relative rounded-lg transition",
                activeId === c.id ? "bg-brand-50" : "hover:bg-slate-50",
              )}
            >
              <button
                className="w-full text-left px-3 py-2.5 pr-8"
                onClick={() => openConversation(c.id)}
              >
                <div className="text-sm font-medium text-slate-800 truncate">{c.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {c.messageCount} 条 · {new Date(c.updatedAt).toLocaleDateString("zh-CN")}
                </div>
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(c.id);
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="h-14 px-4 border-b border-slate-200 flex items-center gap-3 bg-white shrink-0">
          <button
            className="btn-ghost p-1.5"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          >
            <ChevronLeft
              size={16}
              className={cn("transition-transform", sidebarOpen ? "" : "rotate-180")}
            />
          </button>
          <MessageSquare size={18} className="text-brand-600" />
          <span className="font-semibold">AI 知识问答</span>
          <div className="ml-auto flex items-center gap-2">
            {activeId && (
              <button className="btn-ghost text-xs" onClick={newConversation}>
                <Plus size={12} /> 新会话
              </button>
            )}
          </div>
        </header>

        {/* 消息区域 */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-5 bg-slate-50">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-24">
              <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={28} className="text-brand-500" />
              </div>
              <p className="text-base font-medium text-slate-700">向知识库提问</p>
              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                我会基于您上传的文档，用 RAG 检索 + 大模型生成的方式为您解答
              </p>
              {/* <div className="flex flex-wrap gap-2 justify-center mt-4 max-w-lg mx-auto">
                {["上传的文档有什么内容？", "总结一下主要知识点", "有哪些相关的概念？"].map(
                  (q, i) => (
                    <button
                      key={i}
                      className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600 transition"
                      onClick={() => setInput(q)}
                    >
                      {q}
                    </button>
                  ),
                )}
              </div> */}
            </div>
          )}

          {error && (
            <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onCitationClick={openDocument} />
          ))}

          {streaming && (
            <MessageBubble
              msg={{
                id: "stream",
                role: "assistant",
                content: streamingText,
                citations: [],
                createdAt: new Date().toISOString(),
              }}
              onCitationClick={openDocument}
              streaming
            />
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t border-slate-200 bg-white p-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition">
              <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-slate-800 placeholder:text-slate-400 max-h-40 py-1 leading-relaxed"
                placeholder="输入问题，按 Enter 发送，Shift+Enter 换行..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                className={cn(
                  "shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition flex items-center gap-1",
                  input.trim() && !streaming
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed",
                )}
                disabled={!input.trim() || streaming}
                onClick={send}
              >
                {streaming ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                发送
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 text-center">
              AI 回答仅供参考，请结合原始文档核实重要信息
            </p>
          </div>
        </div>

        {/* PDF 预览弹窗 */}
        {pdfDoc && (
          <PdfViewerModal
            documentId={pdfDoc.id}
            title={pdfDoc.title}
            initialPage={pdfDoc.page}
            onClose={closeDocument}
          />
        )}

        {/* Markdown 预览弹窗 */}
        {mdDoc && (
          <MarkdownPreviewModal
            documentId={mdDoc.id}
            title={mdDoc.title}
            onClose={closeDocument}
          />
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  streaming,
  onCitationClick,
}: {
  msg: ChatMessage;
  streaming?: boolean;
  onCitationClick: (documentId: string, documentTitle: string, mime: string, page?: number) => void;
}) {
  const isUser = msg.role === "user";

  const isMarkdown = (mime: string, title: string) =>
    mime.includes("markdown") || mime === "text/markdown" || title.toLowerCase().endsWith(".md");

  return (
    <>
      <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[80%] rounded-2xl px-4 py-3 shadow-soft",
            isUser
              ? "bg-brand-600 text-white rounded-br-md"
              : "bg-white border border-slate-200 text-slate-800 rounded-bl-md",
          )}
        >
          {/* 消息内容 */}
          <div className="leading-relaxed text-sm">
            {isUser ? (
              <p className="whitespace-pre-wrap">{msg.content}</p>
            ) : (
              <div className="prose prose-sm prose-slate max-w-none
                prose-p:my-1 prose-p:leading-relaxed
                prose-headings:text-slate-800 prose-headings:font-semibold
                prose-h2:text-lg prose-h3:text-base
                prose-ul:text-sm prose-ol:text-sm
                prose-li:my-0.5
                prose-code:text-brand-600 prose-code:bg-slate-100 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-slate-800 prose-pre:text-slate-100
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content || (streaming ? "思考中..." : "（无内容）")}
                </ReactMarkdown>
                {streaming && (
                  <span className="inline-block w-1.5 h-4 bg-brand-400 ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            )}
          </div>

          {/* 参考资料 */}
          {!isUser && msg.citations?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5 mb-2">
                <Quote size={12} className="text-brand-400" />
                <span className="text-xs font-medium text-slate-500">参考资料</span>
              </div>
              <div className="space-y-2">
                {msg.citations.map((c) => (
                  <button
                    key={c.index}
                    onClick={() => onCitationClick(c.documentId, c.documentTitle, c.mime || "", c.page ?? undefined)}
                    className="w-full text-left flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 hover:bg-brand-50 border border-transparent hover:border-brand-200 transition group cursor-pointer"
                  >
                    <span
                      className={cn(
                        "shrink-0 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center mt-0.5",
                        isUser ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700 group-hover:bg-brand-200",
                      )}
                    >
                      {c.index}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-700 truncate flex items-center gap-1">
                        {isMarkdown(c.mime || "", c.documentTitle) ? (
                          <span className="shrink-0 text-blue-500 font-medium">MD</span>
                        ) : (
                          <BookOpen size={10} className="text-slate-400 shrink-0" />
                        )}
                        {c.documentTitle}
                        {c.page != null && (
                          <span className="ml-1 text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full shrink-0">
                            第{c.page}页
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {c.snippet}
                      </div>
                    </div>
                    <ExternalLink size={10} className="text-slate-400 group-hover:text-brand-500 mt-1 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 引用详情弹窗 */}
    </>
  );
}
