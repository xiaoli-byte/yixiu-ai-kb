import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  DocumentPermissionEntry,
  DocumentPermissionScope,
  DocumentPermissionUpdateRequest,
  PermissionMode,
} from "@/services/documents";
import { list as listUsers, type User } from "@/services/users";
import { list as listDepartments, type Department } from "@/services/departments";
import { cn } from "@/lib/utils";

export type PermissionModalTarget =
  | {
      type: "single";
      documentId?: string;
      documentName: string;
      currentPermissionScope?: DocumentPermissionScope;
      searchable?: boolean;
      aiReferenceEnabled?: boolean;
    }
  | {
      type: "batch";
      count: number;
      documentIds?: string[];
    };

interface PermissionModalProps {
  open: boolean;
  target: PermissionModalTarget | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (request: DocumentPermissionUpdateRequest) => void | Promise<void>;
}

const SCOPES: Array<{ value: DocumentPermissionScope; label: string; description: string }> = [
  { value: "PRIVATE", label: "仅本人可见", description: "仅上传人或指定成员可访问" },
  { value: "MEMBERS", label: "指定成员可见", description: "选择具体成员作为可见对象" },
  { value: "DEPARTMENTS", label: "指定部门可见", description: "部门成员可查看文档" },
  { value: "COMPANY", label: "公司可见", description: "企业内用户均可查看" },
  { value: "PUBLIC", label: "公开可见", description: "系统内可访问用户均可查看" },
  { value: "ADMIN", label: "管理员可见", description: "仅管理员和知识库管理者可见" },
];

const ACTIONS: Array<{ key: keyof DocumentPermissionEntry; label: string }> = [
  { key: "canView", label: "可查看" },
  { key: "canDownload", label: "可下载" },
  { key: "canEdit", label: "可编辑" },
  { key: "canDelete", label: "可删除" },
  { key: "canManagePermission", label: "可管理权限" },
];

export function PermissionModal({ open, target, saving = false, onClose, onSave }: PermissionModalProps) {
  const [permissionScope, setPermissionScope] = useState<DocumentPermissionScope>("COMPANY");
  const [subjectId, setSubjectId] = useState("");
  const [actions, setActions] = useState<Record<keyof DocumentPermissionEntry, boolean>>({
    subjectType: false,
    subjectId: false,
    canView: true,
    canDownload: false,
    canEdit: false,
    canDelete: false,
    canManagePermission: false,
  });
  const [searchable, setSearchable] = useState(true);
  const [aiReferenceEnabled, setAiReferenceEnabled] = useState(true);
  const [applyToChildren, setApplyToChildren] = useState(false);
  const [mode, setMode] = useState<PermissionMode>("APPEND");
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    if (target.type === "single") {
      setPermissionScope(target.currentPermissionScope || "COMPANY");
      setSearchable(target.searchable ?? true);
      setAiReferenceEnabled(target.aiReferenceEnabled ?? true);
      setMode("DIRECT");
    } else {
      setPermissionScope("COMPANY");
      setSearchable(true);
      setAiReferenceEnabled(true);
      setMode("APPEND");
    }
    setSubjectId("");
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSubjects(true);
    Promise.all([listUsers(), listDepartments()])
      .then(([u, d]) => {
        if (cancelled) return;
        setUsers(u);
        setDepartments(d);
      })
      .catch(() => {
        if (cancelled) return;
        setUsers([]);
        setDepartments([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingSubjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const needsSubject = permissionScope === "MEMBERS" || permissionScope === "DEPARTMENTS";
  const derivedSubjectType: DocumentPermissionEntry["subjectType"] =
    permissionScope === "DEPARTMENTS" ? "DEPARTMENT" : "USER";

  function handleScopeChange(scope: DocumentPermissionScope) {
    setPermissionScope(scope);
    setSubjectId("");
  }

  if (!open || !target) return null;

  const title = target.type === "single" ? "权限设置" : "批量设置权限";
  const subtitle = target.type === "single" ? target.documentName : `已选择 ${target.count} 个文档`;

  function toggleAction(key: keyof DocumentPermissionEntry) {
    if (key === "subjectType" || key === "subjectId") return;
    setActions((current) => ({ ...current, [key]: !current[key] }));
  }

  function submit() {
    const entries: DocumentPermissionEntry[] =
      needsSubject && subjectId
        ? [
            {
              subjectType: derivedSubjectType,
              subjectId,
              canView: actions.canView,
              canDownload: actions.canDownload,
              canEdit: actions.canEdit,
              canDelete: actions.canDelete,
              canManagePermission: actions.canManagePermission,
            },
          ]
        : [];

    void onSave({
      permissionScope,
      entries,
      searchable,
      aiReferenceEnabled,
      applyToChildren,
      mode,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
          <button className="grid h-7 w-7 place-items-center rounded text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {target.type === "batch" && (
            <section>
              <div className="mb-2 text-[13px] font-medium text-slate-900">批量模式</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <RadioCard
                  checked={mode === "APPEND"}
                  description="在现有权限基础上增加新的可见对象与动作权限"
                  label="追加权限"
                  onClick={() => setMode("APPEND")}
                />
                <RadioCard
                  checked={mode === "OVERWRITE"}
                  description="用本次配置替换所选文档的原有权限"
                  label="覆盖权限"
                  onClick={() => setMode("OVERWRITE")}
                />
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 text-[13px] font-medium text-slate-900">权限范围</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCOPES.map((scope) => (
                <RadioCard
                  key={scope.value}
                  checked={permissionScope === scope.value}
                  description={scope.description}
                  label={scope.label}
                  onClick={() => handleScopeChange(scope.value)}
                />
              ))}
            </div>
          </section>

          {needsSubject && (
            <section className="border-t border-slate-100 pt-4">
              <div className="mb-2 text-[13px] font-medium text-slate-900">
                可见对象（{permissionScope === "MEMBERS" ? "成员" : "部门"}）
              </div>
              <select
                className="h-9 w-full rounded border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                disabled={loadingSubjects}
              >
                <option value="">
                  {loadingSubjects ? "加载中..." : `请选择${permissionScope === "MEMBERS" ? "成员" : "部门"}`}
                </option>
                {permissionScope === "MEMBERS"
                  ? users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.email ? `（${u.email}）` : ""}
                      </option>
                    ))
                  : departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
              </select>
              {!loadingSubjects && permissionScope === "MEMBERS" && users.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">暂无可选成员数据</p>
              )}
              {!loadingSubjects && permissionScope === "DEPARTMENTS" && departments.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">暂无可选部门数据</p>
              )}
            </section>
          )}

          <section className="border-t border-slate-100 pt-4">
            <div className="mb-2 text-[13px] font-medium text-slate-900">操作权限</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {ACTIONS.map((action) => (
                <label key={action.key} className="flex h-9 items-center gap-2 rounded border border-slate-200 px-3 text-[13px] text-slate-700">
                  <input
                    checked={Boolean(actions[action.key])}
                    className="h-3.5 w-3.5 accent-brand-600"
                    onChange={() => toggleAction(action.key)}
                    type="checkbox"
                  />
                  {action.label}
                </label>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-100 pt-4">
            <div className="mb-2 text-[13px] font-medium text-slate-900">AI与搜索设置</div>
            <SwitchRow
              checked={searchable}
              description="允许出现在搜索结果中"
              label="是否允许搜索"
              onChange={() => setSearchable((value) => !value)}
            />
            <SwitchRow
              checked={aiReferenceEnabled}
              description="允许AI问答系统引用该文档内容"
              label="是否允许AI问答引用"
              onChange={() => setAiReferenceEnabled((value) => !value)}
            />
          </section>

          {/* <section className="border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input
                checked={applyToChildren}
                className="h-3.5 w-3.5 accent-brand-600"
                onChange={() => setApplyToChildren((value) => !value)}
                type="checkbox"
              />
              将此权限应用到子文件夹中的所有文档
            </label>
          </section> */}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button className="h-8 rounded border border-slate-200 px-4 text-[13px] text-slate-700 hover:bg-slate-50" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="h-8 rounded bg-brand-600 px-4 text-[13px] font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            disabled={saving}
            onClick={submit}
            type="button"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function RadioCard({
  checked,
  label,
  description,
  onClick,
}: {
  checked: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "min-h-[62px] rounded border p-3 text-left transition",
        checked ? "border-brand-300 bg-brand-50 text-brand-900" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span className={cn("grid h-3.5 w-3.5 place-items-center rounded-full border", checked ? "border-brand-600" : "border-slate-300")}>
          {checked && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
        </span>
        {label}
      </div>
      <div className="mt-1 pl-5 text-xs leading-5 text-slate-500">{description}</div>
    </button>
  );
}

function SwitchRow({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0">
      <div>
        <div className="text-[13px] text-slate-900">{label}</div>
        <div className="mt-0.5 text-xs text-slate-500">{description}</div>
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300")}
        onClick={onChange}
        role="switch"
        type="button"
      >
        <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition", checked ? "translate-x-4" : "translate-x-0")} />
      </button>
    </div>
  );
}
