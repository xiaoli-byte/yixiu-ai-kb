"use client";
// AI 知识问答页面：只负责状态编排，具体 UI 拆分到 @/components/qa 下
import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, MessageSquare, Plus, Bug } from "lucide-react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/store";
import qaApi from "@/services/qa";
import type { QaDebugRun } from "@/types/api";
import { cn } from "@/lib/utils";
import { useQaStream } from "@/hooks/useQaStream";
import { ConversationSidebar } from "@/components/qa/ConversationSidebar";
import { MessageBubble } from "@/components/qa/MessageBubble";
import { ChatInput } from "@/components/qa/ChatInput";
import { RewriteSuggestions } from "@/components/qa/RewriteSuggestions";
import { DebugDrawer } from "@/components/qa/DebugDrawer";
import type { ChatMessage, Conversation, MessageFeedback, MessageFeedbackRating } from "@/components/qa/types";

const PdfViewerModal = dynamic(() => import("@/components/PdfViewerModal"), { ssr: false });
const MarkdownPreviewModal = dynamic(() => import("@/components/MarkdownPreviewModal"), { ssr: false });

function isMarkdownDoc(mime: string, title: string): boolean {
  return mime.includes("markdown") || mime === "text/markdown" || title.toLowerCase().endsWith(".md");
}

export default function QaPage() {
  const { accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<{ id: string; title: string; page?: number } | null>(null);
  const [mdDoc, setMdDoc] = useState<{ id: string; title: string } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugRuns, setDebugRuns] = useState<QaDebugRun[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { streaming, streamingText, suggestions, ask, stop, resetSuggestions } = useQaStream();

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

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  async function loadConversations() {
    try {
      const list = await qaApi.conversationList();
      setConversations(list || []);
    } catch (e) {
      console.error("加载会话列表失败", e);
    }
  }

  const loadDebugRuns = useCallback(async (conversationId?: string | null) => {
    setDebugLoading(true);
    setDebugError(null);
    try {
      const list = await qaApi.getDebugRuns({
        conversationId: conversationId ?? activeId,
        limit: 10,
      });
      setDebugRuns(list || []);
    } catch (e: any) {
      setDebugError(e?.message || "加载调试日志失败");
    } finally {
      setDebugLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    if (debugOpen) {
      void loadDebugRuns(activeId);
    }
  }, [activeId, debugOpen, loadDebugRuns]);

  async function openConversation(id: string) {
    try {
      setActiveId(id);
      resetSuggestions();
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
    resetSuggestions();
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

  const handleFeedback = useCallback(async (
    messageId: string,
    rating: MessageFeedbackRating,
    feedbackText?: string | null,
  ): Promise<MessageFeedback> => {
    try {
      const feedback = await qaApi.updateMessageFeedback(messageId, {
        rating,
        feedbackText,
      });
      setMessages((items) =>
        items.map((item) => (item.id === messageId ? { ...item, feedback } : item)),
      );
      return feedback;
    } catch (e: any) {
      setError(e?.message || "Feedback failed");
      throw e;
    }
  }, []);

  const send = useCallback(async (overrideQuestion?: string) => {
    const rawQuestion = typeof overrideQuestion === "string" ? overrideQuestion : input;
    if (!rawQuestion.trim() || streaming) return;
    const q = rawQuestion.trim();
    setInput("");
    setError(null);
    resetSuggestions();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      role: "user",
      content: q,
      citations: [],
      feedback: { rating: "none", text: null, updatedAt: null },
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg]);

    const result = await ask({ conversationId: activeId, question: q, accessToken });

    if (result.status === "done") {
      const finalMsg: ChatMessage = {
        id: result.messageId || "ai-" + Date.now(),
        role: "assistant",
        content: result.content,
        citations: result.citations,
        feedback: { rating: "none", text: null, updatedAt: null },
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, finalMsg]);
      const convId = result.conversationId ?? activeId;
      setActiveId(convId);
      await loadConversations();
      if (debugOpen) {
        await loadDebugRuns(convId);
      }
    } else if (result.status === "aborted") {
      // 用户主动停止：已生成的部分文本保留为一条 assistant 消息（仅本地展示）
      const partialMsg: ChatMessage = {
        id: "ai-stopped-" + Date.now(),
        role: "assistant",
        content: result.content,
        citations: result.citations,
        feedback: { rating: "none", text: null, updatedAt: null },
        createdAt: new Date().toISOString(),
        stopped: true,
      };
      setMessages((m) => [...m, partialMsg]);
    } else {
      // 发送失败：恢复输入框内容，保留用户消息气泡，并展示错误提示
      setError(result.message);
      setInput(q);
    }
  }, [input, streaming, activeId, accessToken, debugOpen, loadDebugRuns, ask, resetSuggestions]);

  return (
    <div className="flex h-screen overflow-hidden">
      <ConversationSidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        onNew={newConversation}
        onSelect={openConversation}
        onDelete={deleteConversation}
      />

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="h-14 px-4 border-b border-slate-200 flex items-center gap-3 bg-white shrink-0">
          <button
            className="btn-ghost p-1.5"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          >
            <ChevronLeft size={16} className={cn("transition-transform", sidebarOpen ? "" : "rotate-180")} />
          </button>
          <MessageSquare size={18} className="text-ai" />
          <span className="font-semibold">AI 知识问答</span>
          {activeId && (
            <span
              className="hidden rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500 sm:inline-flex"
              title={activeId}
            >
              Conversation {activeId.slice(0, 8)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              className={cn("btn-ghost text-xs", debugOpen && "bg-slate-100 text-brand-700")}
              onClick={() => setDebugOpen(true)}
              title="RAG 调试"
            >
              <Bug size={12} /> 调试
            </button>
            {activeId && (
              <button className="btn-ghost text-xs" onClick={newConversation}>
                <Plus size={12} /> 新会话
              </button>
            )}
          </div>
        </header>

        {/* 消息 + 输入：同一滚动容器，输入框 sticky 贴底，滚动条贯穿全高 */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto bg-slate-50">
          <div className="flex min-h-full flex-col">
            <div className="flex-1 px-4 py-6 space-y-5">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-24">
              <div className="w-16 h-16 bg-ai-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={28} className="text-ai" />
              </div>
              <p className="text-base font-medium text-slate-700">向知识库提问</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                我会基于您上传的文档，用 RAG 检索 + 大模型生成的方式为您解答
              </p>
            </div>
          )}

          {error && (
            <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onCitationClick={openDocument} onFeedback={handleFeedback} />
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

              <RewriteSuggestions suggestions={suggestions} disabled={streaming} onPick={(s) => void send(s)} />
            </div>

            <ChatInput
              value={input}
              onChange={setInput}
              onSend={() => void send()}
              onStop={stop}
              streaming={streaming}
              textareaRef={textareaRef}
            />
          </div>
        </div>

        {/* PDF 预览弹窗 */}
        {pdfDoc && (
          <PdfViewerModal documentId={pdfDoc.id} title={pdfDoc.title} initialPage={pdfDoc.page} onClose={closeDocument} />
        )}

        {/* Markdown 预览弹窗 */}
        {mdDoc && <MarkdownPreviewModal documentId={mdDoc.id} title={mdDoc.title} onClose={closeDocument} />}
      </div>

      <DebugDrawer
        open={debugOpen}
        runs={debugRuns}
        loading={debugLoading}
        error={debugError}
        activeConversationId={activeId}
        onClose={() => setDebugOpen(false)}
        onRefresh={() => loadDebugRuns(activeId)}
      />
    </div>
  );
}
