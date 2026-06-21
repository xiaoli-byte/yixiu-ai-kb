"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import authApi from "@/services/auth";
import { useAuth } from "@/lib/store";
import { BookOpen, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, accessToken } = useAuth();
  const [email, setEmail] = useState("account@demo.com");
  const [password, setPassword] = useState("demo123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (accessToken) {
    router.replace("/documents");
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await authApi.login({ email, password });
      setAuth(data);
      router.push("/documents");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-brand-600 text-white grid place-items-center">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AI 知识库</h1>
            <p className="text-xs text-slate-500">企业级知识管理与智能问答</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">邮箱</label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">密码</label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>
          {error && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            登录
          </button>
          <p className="text-xs text-center text-slate-400">
            演示账号：account@demo.com / demo123
          </p>
        </form>
      </div>
    </div>
  );
}