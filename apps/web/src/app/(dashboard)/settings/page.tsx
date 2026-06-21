"use client";
import { useEffect, useState } from "react";
import {
  Users,
  Building2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import usersApi from "@/services/users";
import departmentsApi from "@/services/departments";
import { useAuth } from "@/lib/store";
import { ApiError } from "@/lib/api-client";
import { Role, ROLE_LABELS } from "@/types/permissions";

type Tab = "users" | "departments";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="text-brand-600" size={24} />
            系统设置
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            管理用户账户、组织结构和权限
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("users")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition",
            tab === "users"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Users size={16} />
          用户管理
        </button>
        <button
          onClick={() => setTab("departments")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition",
            tab === "departments"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          <Building2 size={16} />
          部门管理
        </button>
      </div>

      {tab === "users" ? (
        <UsersTab />
      ) : (
        <DepartmentsTab />
      )}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<any>(null);
  const [showResetPwdModal, setShowResetPwdModal] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [depts, setDepts] = useState<any[]>([]);

  const currentUser = useAuth((s: any) => s.user);
  const isAdmin = currentUser?.role === Role.ADMIN || currentUser?.role === Role.SUPER_ADMIN;

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await usersApi.list();
      setUsers(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDepts() {
    try {
      const res = await departmentsApi.list();
      setDepts(res || []);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchUsers();
    fetchDepts();
  }, []);

  const filteredUsers = users.filter(
    (u: any) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleCreate(form: any) {
    setSubmitting(true);
    try {
      await usersApi.create(form);
      setShowCreateModal(false);
      await fetchUsers();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(id: string, form: any) {
    setSubmitting(true);
    try {
      await usersApi.update(id, form);
      setShowEditModal(null);
      await fetchUsers();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(id: string, newPassword: string) {
    setSubmitting(true);
    try {
      await usersApi.resetPassword(id, newPassword);
      setShowResetPwdModal(null);
      alert(`密码已重置为: ${newPassword}`);
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确认删除用户 "${name}"？此操作不可恢复。`)) return;
    try {
      await usersApi.remove(id);
      await fetchUsers();
    } catch (e: any) {
      if (e instanceof ApiError) alert(e.message);
    }
  }

  const ROLE_COLORS: Record<string, string> = {
    [Role.SUPER_ADMIN]: "bg-red-100 text-red-700 ring-red-200",
    [Role.ADMIN]: "bg-purple-100 text-purple-700 ring-purple-200",
    [Role.EDITOR]: "bg-blue-100 text-blue-700 ring-blue-200",
    [Role.VIEWER]: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  const ROLES = [
    { value: Role.ADMIN, label: ROLE_LABELS[Role.ADMIN] },
    { value: Role.EDITOR, label: ROLE_LABELS[Role.EDITOR] },
    { value: Role.VIEWER, label: ROLE_LABELS[Role.VIEWER] },
  ];

  return (
    <>
      <div className="card p-4 mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <input
            className="input pl-9 w-full"
            placeholder="搜索用户名或邮箱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-sm text-slate-500">共 {filteredUsers.length} 个用户</div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            添加用户
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">用户</th>
              <th className="text-left px-4 py-3">邮箱</th>
              <th className="text-left px-4 py-3">部门</th>
              <th className="text-left px-4 py-3">角色</th>
              <th className="text-left px-4 py-3">创建时间</th>
              {isAdmin && <th className="text-right px-4 py-3">操作</th>}
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <Loader2 className="inline animate-spin mr-2" size={16} /> 加载中
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16 text-slate-400">
                  {search ? "没有找到匹配的用户" : "暂无用户"}
                </td>
              </tr>
            ) : (
              filteredUsers.map((u: any) => {
                const dept = depts.find((d: any) => d.id === u.departmentId);
                return (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-medium">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 flex items-center gap-2">
                            {u.name}
                            {u.id === currentUser?.id && (
                              <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded">当前</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {dept ? dept.name : <span className="text-slate-400">未分配</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("badge ring-1 ring-inset", ROLE_COLORS[u.role] || ROLE_COLORS[Role.VIEWER])}>
                        {ROLES.find((r: any) => r.value === u.role)?.label || ROLE_LABELS[u.role as Role] || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(u.createdAt).toLocaleString("zh-CN")}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button className="btn-ghost px-2 py-1" onClick={() => setShowEditModal(u)} title="编辑">
                          编辑
                        </button>
                        <button className="btn-ghost px-2 py-1" onClick={() => setShowResetPwdModal(u)} title="重置密码">
                          重置密码
                        </button>
                        {u.id !== currentUser?.id && (
                          <button className="btn-ghost px-2 py-1 text-rose-600" onClick={() => handleDelete(u.id, u.name)} title="删除">
                            删除
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <UserFormModal
          depts={depts}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          submitting={submitting}
        />
      )}

      {showEditModal && (
        <UserFormModal
          initial={showEditModal}
          depts={depts}
          onClose={() => setShowEditModal(null)}
          onSubmit={(form: any) => handleEdit(showEditModal.id, form)}
          submitting={submitting}
        />
      )}

      {showResetPwdModal && (
        <ResetPasswordModal
          userName={showResetPwdModal.name}
          onClose={() => setShowResetPwdModal(null)}
          onSubmit={(pwd: string) => handleResetPassword(showResetPwdModal.id, pwd)}
          submitting={submitting}
        />
      )}
    </>
  );
}

function UserFormModal({ initial, depts, onClose, onSubmit, submitting }: any) {
  const [email, setEmail] = useState(initial?.email || "");
  const [name, setName] = useState(initial?.name || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(initial?.role || Role.VIEWER);
  const [deptId, setDeptId] = useState(initial?.departmentId || "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "请输入用户名";
    if (!initial) {
      if (!email.trim()) errs.email = "请输入邮箱";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "邮箱格式不正确";
      if (!password) errs.password = "请输入密码";
      else if (password.length < 6) errs.password = "密码至少6位";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    if (initial) {
      onSubmit({ name: name.trim(), role, departmentId: deptId || null });
    } else {
      onSubmit({ email: email.trim(), name: name.trim(), password, role, departmentId: deptId || null });
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">{initial ? "编辑用户" : "添加用户"}</h3>
          <button className="btn-ghost p-1" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          {!initial && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">邮箱 <span className="text-rose-500">*</span></label>
              <input type="email" className={cn("input w-full", errors.email && "border-rose-300")} value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">用户名 <span className="text-rose-500">*</span></label>
            <input type="text" className={cn("input w-full", errors.name && "border-rose-300")} value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
          </div>
          {!initial && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">密码 <span className="text-rose-500">*</span></label>
              <input type="password" className={cn("input w-full", errors.password && "border-rose-300")} value={password} onChange={(e) => setPassword(e.target.value)} />
              {errors.password && <p className="text-xs text-rose-500 mt-1">{errors.password}</p>}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">部门</label>
            <select className="input w-full" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">未分配</option>
              {depts.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
            <div className="space-y-2">
              {[
                { value: Role.ADMIN, label: ROLE_LABELS[Role.ADMIN], desc: "完整的管理权限" },
                { value: Role.EDITOR, label: ROLE_LABELS[Role.EDITOR], desc: "可上传和编辑文档" },
                { value: Role.VIEWER, label: ROLE_LABELS[Role.VIEWER], desc: "仅可查看和检索" },
              ].map((r) => (
                <label key={r.value} className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition", role === r.value ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50")}>
                  <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={(e) => setRole(e.target.value as Role)} className="sr-only" />
                  <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", role === r.value ? "border-brand-500" : "border-slate-300")}>
                    {role === r.value && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-slate-500">{r.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {initial ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ userName, onClose, onSubmit, submitting }: any) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (password.length < 6) { setError("密码至少6位"); return; }
    if (password !== confirm) { setError("两次密码不一致"); return; }
    setError("");
    onSubmit(password);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">重置密码</h3>
          <button className="btn-ghost p-1" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">为用户 <strong>{userName}</strong> 设置新密码</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">新密码 <span className="text-rose-500">*</span></label>
            <input type="password" className="input w-full" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少6位" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">确认密码 <span className="text-rose-500">*</span></label>
            <input type="password" className="input w-full" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="再次输入密码" />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            重置
          </button>
        </div>
      </div>
    </div>
  );
}

function DepartmentsTab() {
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentUser = useAuth((s: any) => s.user);
  const isAdmin = currentUser?.role === Role.ADMIN || currentUser?.role === Role.SUPER_ADMIN;

  async function fetchDepts() {
    setLoading(true);
    try {
      const res = await departmentsApi.list();
      setDepts(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDepts(); }, []);

  async function handleCreate(form: any) {
    setSubmitting(true);
    try {
      await departmentsApi.create(form);
      setShowCreateModal(false);
      await fetchDepts();
    } catch (e: any) {
      if (e) alert(e.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(id: string, form: any) {
    setSubmitting(true);
    try {
      await departmentsApi.update(id, form);
      setShowEditModal(null);
      await fetchDepts();
    } catch (e: any) {
      if (e) alert(e.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确认删除部门 "${name}"？该部门下的用户将被移至无部门状态。`)) return;
    try {
      await departmentsApi.remove(id);
      await fetchDepts();
    } catch (e: any) {
      if (e) alert(e.message || "操作失败");
    }
  }

  // 构建树形结构
  const rootDepts = depts.filter((d: any) => !d.parentId);
  const getChildren = (parentId: string) => depts.filter((d: any) => d.parentId === parentId);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-slate-500">共 {depts.length} 个部门</div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            添加部门
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">部门名称</th>
              <th className="text-left px-4 py-3">上级部门</th>
              <th className="text-left px-4 py-3">创建时间</th>
              {isAdmin && <th className="text-right px-4 py-3">操作</th>}
            </tr>
          </thead>
          <tbody>
            {loading && depts.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-slate-400">
                  <Loader2 className="inline animate-spin mr-2" size={16} /> 加载中
                </td>
              </tr>
            ) : depts.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-16 text-slate-400">
                  暂无部门，点击「添加部门」开始
                </td>
              </tr>
            ) : (
              depts.map((d: any) => {
                const parent = depts.find((p: any) => p.id === d.parentId);
                return (
                  <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-slate-400" />
                        <span className="font-medium text-slate-800">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {parent ? parent.name : <span className="text-slate-400">顶级部门</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(d.createdAt).toLocaleString("zh-CN")}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button className="btn-ghost px-2 py-1" onClick={() => setShowEditModal(d)}>编辑</button>
                        <button className="btn-ghost px-2 py-1 text-rose-600" onClick={() => handleDelete(d.id, d.name)}>删除</button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <DeptFormModal depts={depts} onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} submitting={submitting} />
      )}
      {showEditModal && (
        <DeptFormModal initial={showEditModal} depts={depts} onClose={() => setShowEditModal(null)} onSubmit={(form: any) => handleEdit(showEditModal.id, form)} submitting={submitting} />
      )}
    </>
  );
}

function DeptFormModal({ initial, depts, onClose, onSubmit, submitting }: any) {
  const [name, setName] = useState(initial?.name || "");
  const [parentId, setParentId] = useState(initial?.parentId || "");
  const [error, setError] = useState("");

  function handleSubmit() {
    if (!name.trim()) { setError("请输入部门名称"); return; }
    // 禁止将自己设为上级
    if (parentId === initial?.id) { setError("不能将自己设为上级部门"); return; }
    setError("");
    onSubmit({ name: name.trim(), parentId: parentId || null });
  }

  // 过滤掉自己和自己的子部门作为可选上级
  const availableParents = depts.filter((d: any) => d.id !== initial?.id);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">{initial ? "编辑部门" : "添加部门"}</h3>
          <button className="btn-ghost p-1" onClick={onClose}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">部门名称 <span className="text-rose-500">*</span></label>
            <input type="text" className={cn("input w-full", error && !name.trim() && "border-rose-300")} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：技术部" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">上级部门</label>
            <select className="input w-full" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">顶级部门（无上级）</option>
              {availableParents.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {initial ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
