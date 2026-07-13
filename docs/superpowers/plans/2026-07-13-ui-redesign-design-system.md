# 企业知识库 AI 中台 · UI 重设计方案

日期：2026-07-13
定位：企业知识库 / AI 中台（B 端、信息密集、AI 能力前置）
设计方法：ui-ux-pro-max 设计系统生成（variance 4 / motion 4 / density 8）+ 项目现状适配

---

## 1. 设计定位

**双风格体系**，一个系统两种表达：

| 层 | 风格 | 适用范围 |
| --- | --- | --- |
| 全局基调 | **Soft UI Evolution**：中性灰底、柔和阴影、克制的深度层次、WCAG AA+ | 布局骨架、文档管理、检索、图谱、设置 |
| AI 触点 | **AI-Native UI**：流式文本、打字指示、引用上下文卡片、专属 AI 语义色 | QA 问答、AI 引用标注、AI 相关入口/按钮 |

**核心原则**：
1. **少色多灰**——中台界面 90% 面积由中性灰阶构成，彩色只用于表达语义（品牌操作、AI、成功/警告/危险），杜绝装饰性用色。
2. **蓝紫 = AI，点状使用**（参考 DeepSeek）——AI 语义色 #4D6BFE 只做点状强调：AI 触发按钮、小图标、hover 反馈；**不做大面积底色或装饰线**。AI 回答靠"通栏纯文本排版 vs 用户灰气泡"的布局差异区分，不靠颜色。其余交互用品牌蓝。
3. **密度优先**——density 8/10：表格行高收紧、间距用 8–32px 档位，一屏呈现更多信息；留白靠层次分组而不是大间距。
4. **动效表意**——所有动画 150–300ms、进出有别（exit ≈ enter 的 60–70%），只为表达因果（加载、状态切换、流式生成），尊重 `prefers-reduced-motion`。

---

## 2. 设计 Tokens

### 2.1 色彩（语义化 CSS 变量，扩展现有 `globals.css`）

沿用现有 `brand` 蓝色阶（#1d59f5 一系，与推荐值 #2563EB 同族，避免全量迁移），新增 AI 紫与完整语义层：

```css
:root {
  /* 中性面板层（Soft UI Evolution） */
  --background: 248 250 252;      /* slate-50，页面底 */
  --surface: 255 255 255;         /* 卡片/表格 */
  --surface-muted: 241 245 249;   /* slate-100，次级面板/表头 */
  --border: 226 232 240;          /* slate-200 */
  --foreground: 15 23 42;         /* slate-900，正文 */
  --muted-foreground: 100 116 139;/* slate-500，辅助文字 */

  /* 语义色 */
  --primary: 29 89 245;           /* brand-600，品牌操作 */
  --ai: 77 107 254;               /* 蓝紫（DeepSeek 系），AI 专属，仅点状强调 */
  --ai-surface: 240 243 255;      /* 极淡蓝紫，克制使用（hover 反馈等） */
  --success: 5 150 105;           /* emerald-600 */
  --warning: 217 119 6;           /* amber-600 */
  --destructive: 220 38 38;       /* red-600 */
  --ring: 29 89 245;              /* 焦点环随品牌色 */
}
```

Tailwind 侧把这些注册为 `colors.surface / colors.ai / ...`（`rgb(var(--x) / <alpha-value>)`），组件内**禁止裸写 hex/slate-xxx 表达语义**（布局性灰阶可继续用 slate 工具类）。

深色模式：`darkMode: "class"` 已配置，本方案预留变量结构（同名变量在 `.dark` 下重映射，去饱和而非反色），**列为二期**，一期不实现。

### 2.2 字体

中文系统本项目不引入 Google Fonts（内网部署 + 中文主体，Fira 系对 CJK 无效）：

- **正文/标题**：沿用现有系统栈（PingFang SC / Microsoft YaHei…），层级靠字重与字号（标题 600，正文 400，标签 500）。
- **数据数字**：表格数值、统计卡、token 数一律 `font-variant-numeric: tabular-nums`（新增 `.tabular` 工具类），防抖动、易对齐。
- **代码/ID/路径**：`font-mono`（现有 mono 栈）。
- 字号阶：12（辅助）/ 13（表格正文，现状保留）/ 14（正文）/ 16（输入与重要正文）/ 18 / 24 / 32。正文行高 1.5–1.6。

### 2.3 间距 · 圆角 · 阴影

- **间距档**（density 8）：4 / 8 / 12 / 16 / 24 / 32；页面区块间 16–24，卡片内边距 16–20，表格单元格 12–16。
- **圆角阶**：控件 8px（`rounded-lg`，现状）、卡片 12px（`rounded-xl`，由现在的 `rounded-2xl` 收紧一档以贴合高密度）、弹窗 16px、徽标全圆。
- **阴影三档**（替代随机阴影）：
  - `shadow-card`：`0 1px 2px rgba(15,23,42,.05)` —— 静态卡片
  - `shadow-raised`：现 `shadow-soft`（0 6px 24px -8px …12%）—— 悬浮/下拉/popover
  - `shadow-modal`：`0 24px 48px -12px rgba(15,23,42,.25)` —— 弹窗
- 边框优先于阴影表达分隔；阴影只表达"浮起"。

### 2.4 动效

| 场景 | 规格 |
| --- | --- |
| 微交互（hover/按下/开关） | 150ms，ease-out |
| 面板/下拉/弹窗进出 | 进 200ms ease-out（自触发源 scale .96→1 + fade），出 150ms ease-in |
| 列表项入场 | 30ms/项 stagger，只在首次加载 |
| AI 流式输出 | 光标闪烁 + 逐块渲染（现有 SSE），思考中用 3 点脉冲指示 |
| 加载 >300ms | 骨架屏（shimmer），不用整页 spinner |
| 全局 | `prefers-reduced-motion` 下全部退化为瞬时切换；只动 transform/opacity |

---

## 3. 布局与导航骨架

- **侧边栏**（≥1024px 常驻，中台标准）：当前一级导航保留；增加**当前位置高亮**（左侧 2px 品牌色指示条 + 文字加重），图标+文字并列，禁纯图标导航。
- **顶栏**：sticky，含面包屑（≥3 层页面：如 文档管理 > 文件夹名）、全局搜索入口（`/` 快捷键聚焦）、用户区。内容区补偿 padding，禁遮挡。
- **内容区**：`max-w` 不设死（中台要宽），左右 gutter 16/24 随断点；表格页允许内部横向滚动、页面本身禁横向滚动。
- **z-index 阶**：10（sticky 头）/ 20（下拉）/ 40（抽屉）/ 50（弹窗）/ 100（toast），写入注释约定。

---

## 4. 分页面改造要点

### 4.1 概览（overview）
- 统计卡改为高密度 stat tile：数值 `tabular-nums` 24–32px 加重，标签 12px muted；卡片 `shadow-card`。
- 图表遵循 §6 图表规范（图例可见、tooltip、色盲安全，趋势→折线、对比→条形）。

### 4.2 文档管理（documents）
- 表格：表头 sticky + `--surface-muted` 底；行 hover `slate-50/70`（现状保留）；行高由 58px 收至 48–52px；数值/大小/时间列 `tabular-nums`。
- 批量操作条（已有 BatchActionBar）在选中时 slide-in，符合 bulk-actions 准则。
- 状态徽标语义色对齐 tokens（READY→success、FAILED→destructive、处理中→primary + spinner）。
- 空态/加载态：统一空态插画位 + 引导动作（"上传第一个文档"）。

### 4.3 智能检索（search）
- 沿用刚重构的三态工作台，视觉对齐本 tokens；高亮 `mark` 换品牌蓝 10% 底 + 加重（替换现有黄底以统一色彩语义）。
- 结果卡：标题 14 加重、摘要 13 muted、来源/时间 12；命中片段用 `border-l-2` AI 紫标注 AI 相关召回（如语义命中）与蓝色标注关键词命中。

### 4.4 AI 问答（qa）—— AI-Native 重点页（已定稿：DeepSeek 式排版 + 点状 AI 色）
- 用户气泡右对齐 `--surface-muted` 底；AI 回答**不用气泡、不加竖线**，通栏左对齐纯文本，标识为灰字 + AI 色小图标，靠布局差异区分角色。
- 引用卡片等辅助内容一律灰底灰框（slate-50/slate-200）不抢眼，hover 时才泛出 `--ai-surface` 与 AI 色反馈，点击开预览。
- AI 色只出现在点状信号：发送按钮（唯一浓色块）、标识图标、思考三点脉冲；流式光标、代码内联样式用灰阶。
- 消息区白底（bg-white），弱化"聊天软件感"。
- 输入框 sticky bottom，高度 48px 起自适应；生成中显示 3 点脉冲 + "停止生成"。
- 思考/检索阶段展示阶段指示（"正在检索知识库… → 正在生成"）。

### 4.5 知识图谱（graph）
- 画布区深色底可选（图谱在深色下对比更佳），控制面板贴 tokens；节点色板用色盲安全分类色（图表规范）。

---

## 5. 组件规范（globals.css `@layer components` 扩展）

| 组件 | 规范 |
| --- | --- |
| `.btn-primary` | 品牌蓝，现状保留；每屏仅一个主操作 |
| `.btn-ai`（新增） | AI 紫底白字，仅 AI 触发类操作（"向 AI 提问"等） |
| `.btn-ghost / .btn-danger` | 次级灰 hover；危险操作红字红 hover，与主操作空间隔离 |
| `.input` | 现状保留，聚焦环换 `--ring`；错误态红边 + 字段下方错误文案 |
| `.card` | `rounded-xl` + `shadow-card` + border（现 `rounded-2xl` 收一档） |
| 表格 | 统一 `13px`、表头 sticky、行 hover、选择列 checkbox `accent-brand-600` |
| 弹窗 | 遮罩 `slate-900/40`（现状），内容自触发源 scale+fade 进场，Esc 关闭 + 焦点陷阱（Markdown 弹窗已做，推广到全部弹窗） |
| Toast | 右上角，3–5s 自动消失，`aria-live="polite"`，替换现有 `window.alert` |
| 空态 | 图标 + 一句说明 + 主操作按钮，三段式 |
| 确认 | 破坏性操作统一确认弹窗（替换 `window.confirm`），可撤销的用"撤销 toast" |

---

## 6. 无障碍与质量门槛（合并入验收）

- 正文对比 ≥4.5:1，辅助文字 ≥3:1（当前 slate-400 于白底仅 ~2.9:1，辅助文字最浅到 slate-500）。
- 所有可点击元素 `cursor-pointer` + 可见焦点环（禁 `outline-none` 裸用）。
- 图标按钮必须带 `aria-label`/`title`（DocumentTable 已符合）。
- 色彩不作唯一信息载体（状态徽标已带图标，保持）。
- 图表：图例、tooltip、色盲安全色板、数据表格替代（导出）。
- 键盘：表格/列表可 Tab 遍历，弹窗焦点陷阱，`/` 聚焦搜索。

---

## 7. 实施计划

| 期 | 内容 | 涉及 |
| --- | --- | --- |
| **一期 · Tokens 与基座** | globals.css 变量扩展 + tailwind.config 语义色注册 + 阴影/圆角/`.tabular`/`.btn-ai` + toast 组件替换 alert/confirm | 全局，低风险 |
| **二期 · 高频页面** | QA 问答 AI-Native 改造 → 文档管理密度/状态色 → 检索工作台视觉对齐 | 三个主页面 |
| **三期 · 收尾** | 概览 stat tiles + 图谱面板 + 空态统一 + 深色模式变量映射 | 次频页面与增强 |

每期验收：本方案 §6 门槛 + ui-ux-pro-max Pre-Delivery Checklist（375px 响应、reduced-motion、对比度、焦点可见）。
