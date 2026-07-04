"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Lock, Search, User } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/store";
import authApi from "@/services/auth";

export type DemoCredentials = {
  email: string;
  password: string;
} | null;

function KnowledgeCubeIllustration() {
  return (
    <div className="relative mx-auto h-[322px] w-80" aria-hidden="true"><svg viewBox="0 0 340 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xs" data-fg-d3bl0="0.8:7.8677:/src/app/App.tsx:6:5:145:6593:e:svg:xtetetxtetxtxtetxtetxtetxtetxtetxtetetetxtetetetxtetxtetetxtetetetetxtetxtetetetxtetetetetetetxtetxtetxtetxtetxtetetxtetxtetetetetetxtetetetetetxtetetetetetxtetetete:1" data-fgid-d3bl0=":rc:" data-fg-callsite-d3bl101=""><circle cx="270" cy="55" r="32" fill="#bfdbfe" fill-opacity="0.35" data-fg-d3bl2="0.8:7.8677:/src/app/App.tsx:9:7:302:68:e:circle"></circle><circle cx="45" cy="230" r="22" fill="#93c5fd" fill-opacity="0.25" data-fg-d3bl3="0.8:7.8677:/src/app/App.tsx:10:7:377:68:e:circle"></circle><ellipse cx="165" cy="228" rx="88" ry="13" fill="#93c5fd" fill-opacity="0.22" data-fg-d3bl5="0.8:7.8677:/src/app/App.tsx:13:7:485:79:e:ellipse"></ellipse><polygon points="165,218 75,168 165,118 255,168" fill="#60a5fa" fill-opacity="0.45" data-fg-d3bl8="0.8:7.8677:/src/app/App.tsx:17:7:638:85:e:polygon"></polygon><polygon points="75,168 75,108 165,58 165,118" fill="#3b82f6" data-fg-d3bl10="0.8:7.8677:/src/app/App.tsx:19:7:754:64:e:polygon"></polygon><polygon points="165,118 255,168 255,108 165,58" fill="#2563eb" data-fg-d3bl12="0.8:7.8677:/src/app/App.tsx:21:7:850:66:e:polygon"></polygon><polygon points="75,108 165,58 255,108 165,158" fill="#60a5fa" data-fg-d3bl14="0.8:7.8677:/src/app/App.tsx:23:7:946:65:e:polygon"></polygon><polygon points="180,113 240,146 240,108 180,75" fill="#93c5fd" fill-opacity="0.35" data-fg-d3bl16="0.8:7.8677:/src/app/App.tsx:25:7:1060:85:e:polygon"></polygon><line x1="190" y1="93" x2="230" y2="113" stroke="white" stroke-width="1.5" stroke-opacity="0.7" stroke-linecap="round" data-fg-d3bl18="0.8:7.8677:/src/app/App.tsx:27:7:1195:119:e:line"></line><line x1="190" y1="103" x2="225" y2="121" stroke="white" stroke-width="1.5" stroke-opacity="0.7" stroke-linecap="round" data-fg-d3bl19="0.8:7.8677:/src/app/App.tsx:28:7:1321:119:e:line"></line><line x1="190" y1="113" x2="218" y2="129" stroke="white" stroke-width="1.5" stroke-opacity="0.7" stroke-linecap="round" data-fg-d3bl20="0.8:7.8677:/src/app/App.tsx:29:7:1447:119:e:line"></line><rect x="92" y="112" width="8" height="22" rx="2" fill="white" fill-opacity="0.55" transform="skewY(30) translate(0,-10)" data-fg-d3bl22="0.8:7.8677:/src/app/App.tsx:31:7:1611:124:e:rect"></rect><rect x="106" y="105" width="8" height="30" rx="2" fill="white" fill-opacity="0.55" transform="skewY(30) translate(0,-5)" data-fg-d3bl23="0.8:7.8677:/src/app/App.tsx:32:7:1742:123:e:rect"></rect><rect x="120" y="115" width="8" height="18" rx="2" fill="white" fill-opacity="0.55" transform="skewY(30) translate(0,-3)" data-fg-d3bl24="0.8:7.8677:/src/app/App.tsx:33:7:1872:123:e:rect"></rect><rect x="228" y="22" width="72" height="52" rx="9" fill="white" fill-opacity="0.9" data-fg-d3bl26="0.8:7.8677:/src/app/App.tsx:38:7:2162:84:e:rect"></rect><rect x="238" y="32" width="14" height="18" rx="2" fill="#bfdbfe" data-fg-d3bl28="0.8:7.8677:/src/app/App.tsx:40:7:2276:68:e:rect"></rect><polygon points="248,32 252,32 252,36" fill="#93c5fd" data-fg-d3bl29="0.8:7.8677:/src/app/App.tsx:41:7:2351:56:e:polygon"></polygon><rect x="256" y="34" width="34" height="3" rx="1.5" fill="#93c5fd" data-fg-d3bl31="0.8:7.8677:/src/app/App.tsx:43:7:2439:69:e:rect"></rect><rect x="256" y="41" width="26" height="3" rx="1.5" fill="#bfdbfe" data-fg-d3bl32="0.8:7.8677:/src/app/App.tsx:44:7:2515:69:e:rect"></rect><rect x="238" y="54" width="50" height="3" rx="1.5" fill="#bfdbfe" data-fg-d3bl33="0.8:7.8677:/src/app/App.tsx:45:7:2591:69:e:rect"></rect><rect x="238" y="61" width="38" height="3" rx="1.5" fill="#dbeafe" data-fg-d3bl34="0.8:7.8677:/src/app/App.tsx:46:7:2667:69:e:rect"></rect><rect x="18" y="185" width="72" height="44" rx="9" fill="white" fill-opacity="0.88" data-fg-d3bl36="0.8:7.8677:/src/app/App.tsx:51:7:2908:85:e:rect"></rect><rect x="50" y="194" width="8" height="12" rx="4" fill="#3b82f6" fill-opacity="0.7" data-fg-d3bl38="0.8:7.8677:/src/app/App.tsx:53:7:3023:85:e:rect"></rect><path d="M44 203 Q44 211 54 211 Q64 211 64 203" stroke="#3b82f6" stroke-width="1.5" fill="none" stroke-linecap="round" data-fg-d3bl39="0.8:7.8677:/src/app/App.tsx:54:7:3115:119:e:path"></path><line x1="54" y1="211" x2="54" y2="216" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" data-fg-d3bl40="0.8:7.8677:/src/app/App.tsx:55:7:3241:99:e:line"></line><rect x="28" y="201" width="3" height="8" rx="1.5" fill="#93c5fd" data-fg-d3bl42="0.8:7.8677:/src/app/App.tsx:57:7:3375:69:e:rect"></rect><rect x="33" y="197" width="3" height="16" rx="1.5" fill="#60a5fa" data-fg-d3bl43="0.8:7.8677:/src/app/App.tsx:58:7:3451:69:e:rect"></rect><rect x="38" y="203" width="3" height="6" rx="1.5" fill="#93c5fd" data-fg-d3bl44="0.8:7.8677:/src/app/App.tsx:59:7:3527:69:e:rect"></rect><rect x="70" y="203" width="3" height="6" rx="1.5" fill="#93c5fd" data-fg-d3bl45="0.8:7.8677:/src/app/App.tsx:60:7:3603:69:e:rect"></rect><rect x="75" y="198" width="3" height="12" rx="1.5" fill="#60a5fa" data-fg-d3bl46="0.8:7.8677:/src/app/App.tsx:61:7:3679:69:e:rect"></rect><rect x="80" y="201" width="3" height="8" rx="1.5" fill="#93c5fd" data-fg-d3bl47="0.8:7.8677:/src/app/App.tsx:62:7:3755:69:e:rect"></rect><rect x="12" y="60" width="64" height="54" rx="9" fill="white" fill-opacity="0.88" data-fg-d3bl49="0.8:7.8677:/src/app/App.tsx:67:7:3995:84:e:rect"></rect><rect x="20" y="68" width="48" height="30" rx="4" fill="#dbeafe" data-fg-d3bl51="0.8:7.8677:/src/app/App.tsx:69:7:4118:67:e:rect"></rect><polygon points="20,98 36,78 44,86 54,72 68,98" fill="#93c5fd" fill-opacity="0.7" data-fg-d3bl53="0.8:7.8677:/src/app/App.tsx:71:7:4221:83:e:polygon"></polygon><circle cx="61" cy="76" r="5" fill="#60a5fa" fill-opacity="0.8" data-fg-d3bl55="0.8:7.8677:/src/app/App.tsx:73:7:4336:65:e:circle"></circle><rect x="20" y="102" width="36" height="3" rx="1.5" fill="#bfdbfe" data-fg-d3bl57="0.8:7.8677:/src/app/App.tsx:75:7:4435:69:e:rect"></rect><rect x="20" y="108" width="24" height="3" rx="1.5" fill="#dbeafe" data-fg-d3bl58="0.8:7.8677:/src/app/App.tsx:76:7:4511:69:e:rect"></rect><rect x="254" y="188" width="72" height="68" rx="9" fill="white" fill-opacity="0.88" data-fg-d3bl60="0.8:7.8677:/src/app/App.tsx:81:7:4752:86:e:rect"></rect><circle cx="290" cy="210" r="7" fill="#3b82f6" fill-opacity="0.8" data-fg-d3bl62="0.8:7.8677:/src/app/App.tsx:83:7:4871:67:e:circle"></circle><circle cx="270" cy="232" r="5" fill="#60a5fa" fill-opacity="0.8" data-fg-d3bl63="0.8:7.8677:/src/app/App.tsx:84:7:4945:67:e:circle"></circle><circle cx="310" cy="230" r="5" fill="#60a5fa" fill-opacity="0.8" data-fg-d3bl64="0.8:7.8677:/src/app/App.tsx:85:7:5019:67:e:circle"></circle><circle cx="278" cy="248" r="4" fill="#93c5fd" data-fg-d3bl65="0.8:7.8677:/src/app/App.tsx:86:7:5093:49:e:circle"></circle><circle cx="304" cy="248" r="4" fill="#93c5fd" data-fg-d3bl66="0.8:7.8677:/src/app/App.tsx:87:7:5149:49:e:circle"></circle><line x1="290" y1="217" x2="273" y2="228" stroke="#93c5fd" stroke-width="1.5" stroke-linecap="round" data-fg-d3bl68="0.8:7.8677:/src/app/App.tsx:89:7:5231:101:e:line"></line><line x1="290" y1="217" x2="307" y2="226" stroke="#93c5fd" stroke-width="1.5" stroke-linecap="round" data-fg-d3bl69="0.8:7.8677:/src/app/App.tsx:90:7:5339:101:e:line"></line><line x1="273" y1="236" x2="279" y2="245" stroke="#bfdbfe" stroke-width="1.2" stroke-linecap="round" data-fg-d3bl70="0.8:7.8677:/src/app/App.tsx:91:7:5447:101:e:line"></line><line x1="307" y1="234" x2="303" y2="245" stroke="#bfdbfe" stroke-width="1.2" stroke-linecap="round" data-fg-d3bl71="0.8:7.8677:/src/app/App.tsx:92:7:5555:101:e:line"></line><line x1="273" y1="236" x2="307" y2="234" stroke="#bfdbfe" stroke-width="1" stroke-linecap="round" stroke-dasharray="3 2" data-fg-d3bl72="0.8:7.8677:/src/app/App.tsx:93:7:5663:121:e:line"></line><rect x="98" y="248" width="130" height="28" rx="14" fill="white" fill-opacity="0.85" data-fg-d3bl74="0.8:7.8677:/src/app/App.tsx:98:7:5953:87:e:rect"></rect><circle cx="115" cy="262" r="7" stroke="#3b82f6" stroke-width="1.5" fill="none" data-fg-d3bl75="0.8:7.8677:/src/app/App.tsx:99:7:6047:81:e:circle"></circle><line x1="120" y1="267" x2="124" y2="271" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round" data-fg-d3bl76="0.8:7.8677:/src/app/App.tsx:100:7:6135:101:e:line"></line><rect x="132" y="258" width="60" height="3" rx="1.5" fill="#bfdbfe" data-fg-d3bl77="0.8:7.8677:/src/app/App.tsx:101:7:6243:70:e:rect"></rect><rect x="132" y="264" width="42" height="3" rx="1.5" fill="#dbeafe" data-fg-d3bl78="0.8:7.8677:/src/app/App.tsx:102:7:6320:70:e:rect"></rect><circle cx="248" cy="178" r="4" fill="#93c5fd" fill-opacity="0.55" data-fg-d3bl80="0.8:7.8677:/src/app/App.tsx:105:7:6434:68:e:circle"></circle><circle cx="82" cy="55" r="3" fill="#60a5fa" fill-opacity="0.45" data-fg-d3bl81="0.8:7.8677:/src/app/App.tsx:106:7:6509:68:e:circle"></circle><circle cx="20" cy="150" r="3" fill="#93c5fd" fill-opacity="0.4" data-fg-d3bl82="0.8:7.8677:/src/app/App.tsx:107:7:6584:68:e:circle"></circle><circle cx="320" cy="140" r="3" fill="#bfdbfe" fill-opacity="0.6" data-fg-d3bl83="0.8:7.8677:/src/app/App.tsx:108:7:6659:68:e:circle"></circle></svg> </div>
  );
}

export function LoginClient({ demoCredentials }: { demoCredentials: DemoCredentials }) {
  const router = useRouter();
  const { setAuth, accessToken } = useAuth();
  const [email, setEmail] = useState(demoCredentials?.email || "");
  const [password, setPassword] = useState(demoCredentials?.password || "");
  const [rememberAccount, setRememberAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      router.replace("/documents");
    }
  }, [accessToken, router]);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("ai-knowledge-login-email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberAccount(true);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await authApi.login({ email, password });
      if (rememberAccount) {
        window.localStorage.setItem("ai-knowledge-login-email", email);
      } else {
        window.localStorage.removeItem("ai-knowledge-login-email");
      }
      setAuth(data);
      router.push("/documents");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (accessToken) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f5ff] p-6 text-[#1e3a5f]">
      <main className="flex w-full max-w-[1024px] flex-col overflow-hidden rounded-2xl shadow-[0_8px_40px_rgba(22,119,255,0.1)] lg:h-[541px] lg:min-h-[480px] lg:flex-row">
        <section className="relative min-h-[430px] overflow-hidden bg-[linear-gradient(140deg,#dbeafe_0%,#eff6ff_40%,#e0eeff_100%)] px-8 py-10 sm:px-12 sm:py-14 lg:h-full lg:w-[640px] lg:shrink-0">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,#93c5fd_0%,rgba(147,197,253,0.45)_32%,rgba(147,197,253,0)_70%)] opacity-30" />
          <div className="absolute -bottom-20 -left-14 h-48 w-48 rounded-full bg-[radial-gradient(circle,#60a5fa_0%,rgba(96,165,250,0.35)_35%,rgba(96,165,250,0)_70%)] opacity-20" />

          <div className="relative">
            <h1 className="text-[30px] font-bold leading-[41px] text-[#1e3a5f]">
              企业智能知识库系统
            </h1>
            <p className="mt-3 text-sm leading-[23px] text-[#4b6fa8]">
              构建企业知识中枢，赋能决策与高效协作
            </p>
            <p className="mt-2 text-sm leading-[23px] text-[#4b6fa8]">
              让知识管理更简单、知识价值最大化
            </p>
            <div className="mt-10 flex justify-center lg:mt-0">
              <KnowledgeCubeIllustration />
            </div>
          </div>
        </section>

        <section className="flex bg-white px-8 py-12 sm:px-10 lg:h-full lg:w-96 lg:shrink-0 lg:items-center">
          <div className="mx-auto w-full max-w-[304px]">
            <div className="text-center">
              <h2 className="pb-1 text-xl font-semibold leading-7 text-[#1e3a5f]">登录系统</h2>
              <p className="pb-8 text-xs leading-4 text-[#8ca3c1]">欢迎登录企业智能知识库系统</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">
              <div>
                <label htmlFor="email" className="sr-only">
                  账号
                </label>
                <div className="relative">
                  <User
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ca3c1]"
                  />
                  <input
                    id="email"
                    className="h-[42px] w-full rounded-lg border border-[#d0e1f7] bg-[#f7faff] pl-[37px] pr-[17px] text-sm text-[#1e3a5f] outline-none transition placeholder:text-[#1e3a5f]/50 focus:border-[#1677ff] focus:ring-2 focus:ring-[#1677ff]/15"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="请输入账号"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="sr-only">
                  密码
                </label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ca3c1]"
                  />
                  <input
                    id="password"
                    className="h-[42px] w-full rounded-lg border border-[#d0e1f7] bg-[#f7faff] pl-[37px] pr-[41px] text-sm text-[#1e3a5f] outline-none transition placeholder:text-[#1e3a5f]/50 focus:border-[#1677ff] focus:ring-2 focus:ring-[#1677ff]/15"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8ca3c1] transition hover:text-[#1e3a5f]"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs leading-4">
                <label className="inline-flex items-center gap-1.5 font-medium text-[#8ca3c1]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded-sm border-[#767676] text-[#1677ff] focus:ring-[#1677ff]/20"
                    checked={rememberAccount}
                    onChange={(e) => setRememberAccount(e.target.checked)}
                  />
                  记住账号
                </label>
                <button type="button" className="text-[#1677ff] transition hover:text-[#0958d9]">
                  忘记密码？
                </button>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                  {error}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1677ff] text-sm font-semibold leading-5 text-white transition hover:bg-[#0958d9] disabled:pointer-events-none disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? <LoaderCircle size={15} className="animate-spin" /> : null}
                  登录
                </button>
              </div>

              <p className="pt-6 text-center text-xs leading-4 text-[#8ca3c1]">
                还没有账号？{" "}
                <button type="button" className="text-[#1677ff] transition hover:text-[#0958d9]">
                  立即注册
                </button>
              </p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
