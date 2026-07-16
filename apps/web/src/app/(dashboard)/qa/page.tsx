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

// 统一预览弹窗：内部按文件类型（PDF/图片/音视频/Markdown/文本/Office）分发渲染方式
const DocumentPreviewModal = dynamic(() => import("@/components/DocumentPreviewModal"), { ssr: false });

export default function QaPage() {
  const { accessToken } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; title: string; mime?: string; page?: number; canDownload?: boolean } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugRuns, setDebugRuns] = useState<QaDebugRun[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 在途问答请求的会话归属守卫：每次发起自增；切换/新建/删除当前会话时也自增以作废在途请求。
  // 完成回调用发起时捕获的序号与当前值比对，判断用户是否已经切走当前会话。
  const requestSeqRef = useRef(0);

  const { streaming, streamingText, suggestions, ask, stop, resetSuggestions } = useQaStream();

  const openDocument = useCallback((docId: string, title: string, mime: string, page?: number, canDownload?: boolean) => {
    setPreviewDoc({ id: docId, title, mime, page, canDownload });
  }, []);

  const closeDocument = useCallback(() => {
    setPreviewDoc(null);
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
    stop(); // 先中止在途流，避免旧会话的回答回填到即将切入的会话
    requestSeqRef.current += 1; // 作废在途请求的会话归属
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
    stop(); // 先中止在途流，避免旧会话的回答回填到新会话
    requestSeqRef.current += 1; // 作废在途请求的会话归属
    setActiveId(null);
    setMessages([]);
    resetSuggestions();
    setError(null);
  }

  async function deleteConversation(id: string) {
    try {
      await qaApi.conversationDelete(id);
      setConversations((cs) => cs.filter((c) => c.id !== id));
      // 删除的是当前会话时走 newConversation —— 其中已先 stop() 中止在途流并作废归属，再切换。
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

    // 记录本次请求的会话上下文：发起时的 activeId 与自增序号。
    // 完成时若序号已被切换/新建/删除会话动作改写，说明用户已切走，本次结果不得回填当前 UI。
    const mySeq = ++requestSeqRef.current;
    const startActiveId = activeId;

    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      role: "user",
      content: q,
      citations: [],
      feedback: { rating: "none", text: null, updatedAt: null },
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg]);

    const result = await ask({ conversationId: startActiveId, question: q, accessToken });

    // 归属守卫：用户是否已在请求进行中切换/新建/删除会话（作废了本次请求）。
    // 注意「发起时 null → 服务端返回新 id」不算切走，因为只有那些动作才会自增序号。
    const superseded = mySeq !== requestSeqRef.current;

    if (result.status === "done") {
      if (superseded) {
        // 用户已切到别的会话：不 append 消息、不抢占 activeId，只刷新列表让新会话出现在侧栏。
        await loadConversations();
        return;
      }
      const finalMsg: ChatMessage = {
        id: result.messageId || "ai-" + Date.now(),
        role: "assistant",
        content: result.content,
        citations: result.citations,
        feedback: { rating: "none", text: null, updatedAt: null },
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, finalMsg]);
      const convId = result.conversationId ?? startActiveId;
      setActiveId(convId);
      await loadConversations();
      if (debugOpen) {
        await loadDebugRuns(convId);
      }
    } else if (result.status === "aborted") {
      if (superseded) {
        // 因切换会话而中止：服务端可能已把部分回答落库，只刷新列表，不改动当前 UI。
        await loadConversations();
        return;
      }
      // 用户点击“停止”按钮：已生成的部分文本保留为一条 assistant 消息（仅本地展示），
      // 并把已知会话 ID 落到 activeId —— 首问被停止也能拿到 conversationId，下一问继续同一会话。
      // 首个 token 前就停止（partial 为空）时不展示空气泡，与后端"不落空消息"的语义一致。
      if (result.content) {
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
      }
      setActiveId(result.conversationId ?? startActiveId);
      await loadConversations();
    } else {
      // 发送失败：恢复输入框内容，保留用户消息气泡，并展示错误提示。
      // 若用户已切走则不打扰当前会话（静默丢弃）。
      if (superseded) return;
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
          </div>
        </header>

        {/* 消息 + 输入：同一滚动容器，输入框 sticky 贴底，滚动条贯穿全高 */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto bg-white">
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

        {/* 文档预览弹窗：按文件类型分发渲染方式 */}
        {previewDoc && (
          <DocumentPreviewModal
            documentId={previewDoc.id}
            title={previewDoc.title}
            mime={previewDoc.mime}
            initialPage={previewDoc.page}
            canDownload={previewDoc.canDownload}
            onClose={closeDocument}
          />
        )}
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
