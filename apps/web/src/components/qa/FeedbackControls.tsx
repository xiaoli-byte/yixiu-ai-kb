"use client";
// 消息反馈控件：点赞 / 点踩 + 可选备注
import { useEffect, useState } from "react";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageFeedback, MessageFeedbackRating } from "./types";

export interface FeedbackControlsProps {
  messageId: string;
  feedback?: MessageFeedback;
  onSubmit: (
    messageId: string,
    rating: MessageFeedbackRating,
    feedbackText?: string | null,
  ) => Promise<MessageFeedback>;
}

export function FeedbackControls({ messageId, feedback, onSubmit }: FeedbackControlsProps) {
  const current = feedback ?? { rating: "none" as const, text: null, updatedAt: null };
  const [note, setNote] = useState(current.text || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(current.text || "");
  }, [current.text, messageId]);

  const submit = async (rating: MessageFeedbackRating, text = note) => {
    setSaving(true);
    try {
      await onSubmit(messageId, rating, text);
    } finally {
      setSaving(false);
    }
  };

  const selected = current.rating;
  const showNote = selected !== "none" || note.trim().length > 0;

  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn(
            "rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600",
            selected === "up" && "bg-emerald-50 text-emerald-600",
          )}
          disabled={saving}
          title="Thumbs up"
          onClick={() => void submit(selected === "up" ? "none" : "up")}
        >
          <ThumbsUp size={14} />
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600",
            selected === "down" && "bg-red-50 text-red-600",
          )}
          disabled={saving}
          title="Thumbs down"
          onClick={() => void submit(selected === "down" ? "none" : "down")}
        >
          <ThumbsDown size={14} />
        </button>
        {selected !== "none" && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <Check size={12} /> Saved
          </span>
        )}
      </div>

      {showNote && (
        <div className="mt-2 flex items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-brand-300 focus:bg-white"
            value={note}
            disabled={saving}
            placeholder="Optional feedback"
            onChange={(event) => setNote(event.target.value)}
          />
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving || selected === "none"}
            onClick={() => void submit(selected)}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

export default FeedbackControls;
