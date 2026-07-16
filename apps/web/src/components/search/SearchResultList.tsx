import { Fragment } from "react";
import { Clock, Download, ExternalLink, Eye, FileText, Folder, ShieldCheck, Sparkles } from "lucide-react";
import type { SearchHit } from "@/services/search";
import { badgeTextOfLabel, badgeToneOfLabel, getFileTypeLabel } from "@/lib/file-preview";

interface SearchResultListProps { hits: SearchHit[]; keyword?: string; onView?: (hit: SearchHit) => void; onPreview?: (hit: SearchHit) => void; onOpenOriginal?: (hit: SearchHit) => void; onDownload?: (hit: SearchHit) => void; onAskAI?: (hit: SearchHit) => void; }
export function SearchResultList({ hits, keyword, onView, onPreview, onOpenOriginal, onDownload, onAskAI }: SearchResultListProps) {
  const preview = onPreview ?? onView;
  return <div className="space-y-3 px-4 py-4 sm:px-8">{hits.map((hit) => <article className="flex flex-col gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-raised sm:flex-row sm:gap-4 sm:p-5" key={hit.chunkId}><FileBadge hit={hit} /><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold leading-5 text-slate-950"><TitleWithHighlight title={hit.documentTitle} keyword={keyword} /></h3><HighlightedSnippet className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600" highlight={hit.highlight} text={hit.text} /><ResultMeta hit={hit} /></div><ResultActions hit={hit} onPreview={preview} onOpenOriginal={onOpenOriginal} onDownload={onDownload} onAskAI={onAskAI} /></article>)}</div>;
}
function FileBadge({ hit }: { hit: SearchHit }) { const type = getFileType(hit); return <div aria-label={`文件类型 ${type}`} className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white ${fileBadgeTone(type)}`}>{type === "FILE" ? <FileText size={19} /> : fileBadgeText(type)}</div>; }
/** 文件类型徽标配色：实色底 + 白字（对齐设计稿），作为结果条目的视觉锚点 */
export function fileBadgeTone(type: string) {
  return badgeToneOfLabel(type);
}
/** 徽标缩写：对齐设计稿的单字母/短标识 */
export function fileBadgeText(type: string) {
  return badgeTextOfLabel(type);
}
/** 标题命中标红（对齐设计稿）：后端只返回正文 highlight，标题按关键词在前端标红 */
export function TitleWithHighlight({ title, keyword }: { title: string; keyword?: string }) {
  const tokens = (keyword ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <>{title}</>;
  let parts: string[];
  try {
    parts = title.split(new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi"));
  } catch {
    return <>{title}</>;
  }
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  return <>{parts.map((part, index) => (lowerTokens.includes(part.toLowerCase()) ? <span className="text-red-600" key={index}>{part}</span> : <Fragment key={index}>{part}</Fragment>))}</>;
}
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function ResultMeta({ hit }: { hit: SearchHit }) { return <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Folder aria-hidden="true" className="text-slate-400" size={13} />来自: {hit.categoryPath || "未设置路径"}</span><span className="inline-flex items-center gap-1"><Clock aria-hidden="true" className="text-slate-400" size={13} /><span className="tabular">更新时间: {formatDate(hit.updatedAt || hit.createdAt)}</span></span><span className="inline-flex items-center gap-1"><ShieldCheck aria-hidden="true" className="text-emerald-500" size={13} />权限: {permissionLabel(hit.permissionScope)}</span></div>; }
function ResultActions({ hit, onPreview, onOpenOriginal, onDownload, onAskAI }: { hit: SearchHit; onPreview?: (hit: SearchHit) => void; onOpenOriginal?: (hit: SearchHit) => void; onDownload?: (hit: SearchHit) => void; onAskAI?: (hit: SearchHit) => void }) { return <div className="flex shrink-0 flex-wrap items-center gap-1 sm:self-start">{isPreviewableSearchHit(hit) && <Action label="预览" icon={<Eye size={14} />} onClick={onPreview ? () => onPreview(hit) : undefined} primary />}<Action label="打开原文" icon={<ExternalLink size={14} />} onClick={onOpenOriginal ? () => onOpenOriginal(hit) : undefined} />{hit.canDownload !== false && <Action label="下载" icon={<Download size={14} />} onClick={onDownload ? () => onDownload(hit) : undefined} />}{onAskAI && <Action ai label="向 AI 提问" icon={<Sparkles size={14} />} onClick={() => onAskAI(hit)} />}</div>; }
function Action({ label, icon, onClick, primary = false, ai = false }: { label: string; icon: React.ReactNode; onClick?: () => void; primary?: boolean; ai?: boolean }) { return <button className={`inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${ai ? "font-medium text-ai hover:bg-ai-surface/60" : primary ? "font-medium text-brand-700 hover:bg-brand-50" : "text-slate-600 hover:bg-slate-50"}`} disabled={!onClick} onClick={onClick} type="button">{icon}{label}</button>; }
function HighlightedSnippet({ className, highlight, text }: { className: string; highlight?: string | null; text: string }) { return highlight?.trim() ? <p className={className} dangerouslySetInnerHTML={{ __html: sanitizeSearchHighlight(highlight) }} /> : <p className={className}>{text}</p>; }
export function getFileType(hit: SearchHit) { return getFileTypeLabel(hit.mime, hit.documentTitle); }
// 统一预览弹窗对所有支持类型都有渲染方式（Office/未知类型给下载引导），预览入口不再按类型隐藏
export function isPreviewableSearchHit(_hit: SearchHit) { return true; }
export function sanitizeSearchHighlight(value: string) { return value.replace(/&(?!(?:amp|lt|gt|quot|#39);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&lt;mark&gt;/gi, "<mark>").replace(/&lt;\/mark&gt;/gi, "</mark>"); }
export function permissionLabel(scope?: string | null) { const map: Record<string, string> = { PRIVATE: "仅本人可见", MEMBERS: "指定成员可见", DEPARTMENTS: "部门可见", COMPANY: "公司可见", PUBLIC: "公开可见", ADMIN: "管理员可见" }; return scope ? map[scope] || scope : "权限范围未知"; }
export function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "未知时间"; }
