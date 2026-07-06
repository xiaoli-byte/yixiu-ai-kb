# 知识图谱画布重构计划

## 1. 摘要

将现有的 `GraphCanvas.tsx` 重构为「企业级知识图谱探索画布」：
- 引入「中心节点 + 1 跳 / 2 跳辐射布局」
- 节点数量限制 20-35、边数量限制 30-60
- 节点按类型分色（document/knowledge/tag/category），中心节点视觉更突出
- hover 高亮、click 切换中心、dblclick 扩展占位
- 拆分为纯函数 + 自定义 hooks，逻辑解耦

> 不改动页面布局（`graph/page.tsx` 保持原样）。不切换图库。API 调用位置用 `// TODO:` 标记。

## 2. 现状分析

| 文件 | 当前问题 |
|------|---------|
| [GraphCanvas.tsx](file:///i:/ai-knowledge/apps/web/src/components/graph/GraphCanvas.tsx) | 全部逻辑堆在 `useEffect` + 模块级纯函数中（587 行），布局算法基于「连通分量 + 网格 anchor」，对单中心场景视觉混乱；没有中心节点概念；无 hover 高亮过滤；无 click/dblclick 切换中心；类型只有 4 种（`Document`/`Chunk`/`Entity`/`Tag`），缺少 `Category` |
| [types/api/graph.ts](file:///i:/ai-knowledge/apps/web/src/types/api/graph.ts) | `GraphNode.type` 联合为 `Document \| Chunk \| Entity \| Tag`，缺少 `Category` |
| [graph/page.tsx](file:///i:/ai-knowledge/apps/web/src/app/(dashboard)/graph/page.tsx) | 通过 `useGraphWorkspace` 拉取整张图，没有「点击节点切中心」交互；导出图谱按钮会降级下载 JSON |
| [useGraph.ts](file:///i:/ai-knowledge/apps/web/src/hooks/useGraph.ts) | 已有 `getGraphWorkspace`、`searchGraph` 等端点，可复用 |
| [package.json](file:///i:/ai-knowledge/apps/web/package.json) | `@antv/g6` 已是 `^5.1.1`，无需升级 |

## 3. 关键设计决策

1. **保留兼容**：保留 `GraphCanvas` 组件名与 `GraphCanvasHandle`（`fit` / `exportPng`）两个方法签名；`KnowledgeGraphProps` 完全包含旧 `GraphCanvasProps` 的三个字段（`graph / loading / error`），新增字段全部可选，使 `graph/page.tsx` 无需修改。
2. **类型扩展**：`GraphNode.type` 联合扩展为 `Document \| Chunk \| Entity \| Tag \| Category`（向后兼容，仅是 union 加项）。**不引入 "Knowledge" 抽象**，统一把 `Entity` 视觉映射为"知识点"。
3. **布局策略**：**只用 `preset` 模式 + 自计算 x/y 坐标**，**不**叠加 G6 v5 内置 `radial` 布局，避免双重布局冲突。
4. **数量限制**：1 跳和 2 跳都参与截断。`buildDisplayGraph` 中 BFS 后做按层配额（1 跳优先占 55%、2 跳占剩余），节点总数 ≤ 35、边数 ≤ 60。
5. **事件解耦**：`bindGraphEvents` 返回 dispose 函数；click / dblclick 通过 `lastInteractionAt` ref 做 300ms 防冲突。
6. **样式收敛**：用 `getNodeStyle(type, layer, isCenter)` 纯函数返回样式对象，中心节点 size 放大、`labelFontWeight` 加粗、`halo` 更亮。
7. **状态拆分**：用 `useState` 维护 `centerNodeId`、`hoveredNodeId`，通过 `graph.setElementState(states, true)` 切换高亮状态。

## 4. 实施步骤

### 步骤 1：扩展 `GraphNode` 类型（`apps/web/src/types/api/graph.ts`）

- `GraphNode.type` 联合保持为 `Document \| Chunk \| Entity \| Tag`，**新增** `Category`（仅加项，向后兼容）
- **不在前端做 "Knowledge" 抽象**，统一把 `Entity` 视觉映射为"知识点"
- 视觉映射规则在 `style.ts` 中通过 `LEGEND_LABELS` 集中管理，不引入新的 type 联合成员

### 步骤 2：新建 `apps/web/src/components/graph/knowledgeGraph/` 目录

为避免一次性大改 587 行单文件，先按需求拆成 4 个小文件，旧 `GraphCanvas.tsx` 改为薄壳对外兼容：

| 新文件 | 职责 |
|--------|------|
| `types.ts` | TypeScript 类型定义（节点/边/状态/Props） |
| `style.ts` | `getNodeStyle` / `getEdgeStyle` / `formatLabel` / 调色板常量 |
| `graphLayout.ts` | `buildDisplayGraph`（BFS 截断 + radial 坐标计算） |
| `graphEvents.ts` | `bindGraphEvents`（hover / click / dblclick 事件绑定） |
| `KnowledgeGraph.tsx` | 主组件（`useEffect` 仅做挂载/卸载 + 数据流转） |
| `index.ts` | 重导出，保持旧 import 路径 |

### 步骤 3：实现 `types.ts`（关键类型）

**`KnowledgeGraphProps` 完整兼容旧 `GraphCanvasProps`**（旧的 `graph / loading / error` 必传项保持原样，新功能以可选 prop 暴露）：

```typescript
import type { GraphData, GraphNode, GraphEdge } from "@/types/api";

export type GraphNodeType = GraphNode["type"]; // Document | Chunk | Entity | Tag | Category
                                             // 注：Entity 视觉上呈现为"知识点"，
                                             //     不引入 "Knowledge" 类型

export interface KnowledgeGraphProps {
  // —— 必传，与旧 GraphCanvasProps 完全一致 ——
  graph: GraphData;
  loading?: boolean;
  error?: string;

  // —— 新增可选 prop，向后兼容 ——
  centerNodeId?: string;             // 初始中心节点；未传时取最高权重节点
  maxNodes?: number;                 // 默认 32（一跳 + 二跳都参与限制）
  maxEdges?: number;                 // 默认 48
  onCenterChange?: (nodeId: string) => void;  // 点击切中心时回调（TODO 联调用）
  onExpand?: (nodeId: string) => void;         // 双击扩展占位（TODO 联调 API）
}

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  layer: 0 | 1 | 2;       // 0=中心 1=一跳 2=二跳
  rank: number;            // 同层内排序序号
  isCenter: boolean;
}

export interface DisplayNode {
  id: string;
  data: { label: string; type: GraphNodeType; isCenter: boolean; layer: 0|1|2 };
  style: ReturnType<typeof getNodeStyle>;
}

export interface DisplayEdge {
  id: string;
  source: string;
  target: string;
  data: { label: string; isFirstHop: boolean };
  style: ReturnType<typeof getEdgeStyle>;
}

export interface DisplayGraph {
  nodes: DisplayNode[];
  edges: DisplayEdge[];
  centerId: string | null;
}
```

**注意**：旧 `GraphCanvasProps` 仅有 `graph / loading / error` 三个字段，本计划新增字段全部用 `?:` 修饰，保证 `graph/page.tsx` 的 `<GraphCanvas graph={...} loading={...} error={...} />` 用法不报错。

### 步骤 4：实现 `style.ts`

**类型映射**（`Entity` 视觉呈现为"知识点"，**不引入** `Knowledge` 类型）：

```typescript
// 调色板：key 与 GraphNode.type 严格对齐
export const NODE_PALETTE: Record<GraphNodeType, {
  fill: string; soft: string; halo: string; icon: string; glyph: string; legend: string
}> = {
  Document: { fill: "#2f7bff", soft: "#eff6ff", halo: "#2f7bff", icon: "FileText",  glyph: "文", legend: "文档" },
  Entity:   { fill: "#22c783", soft: "#ecfdf5", halo: "#22c783", icon: "Lightbulb", glyph: "知", legend: "知识点" }, // Entity → 知识点
  Tag:      { fill: "#8b5cf6", soft: "#f5f3ff", halo: "#8b5cf6", icon: "Tag",       glyph: "标", legend: "标签" },
  Category: { fill: "#f59e0b", soft: "#fffbeb", halo: "#f59e0b", icon: "Folder",    glyph: "类", legend: "业务分类" },
  Chunk:    { fill: "#94a3b8", soft: "#f8fafc", halo: "#94a3b8", icon: "Layers",    glyph: "段", legend: "段落" },
};

export const LEGEND_ITEMS: Array<{ type: GraphNodeType; label: string; color: string }> = [
  { type: "Document", label: NODE_PALETTE.Document.legend, color: NODE_PALETTE.Document.fill },
  { type: "Entity",   label: NODE_PALETTE.Entity.legend,   color: NODE_PALETTE.Entity.fill },
  { type: "Tag",      label: NODE_PALETTE.Tag.legend,      color: NODE_PALETTE.Tag.fill },
  { type: "Category", label: NODE_PALETTE.Category.legend, color: NODE_PALETTE.Category.fill },
];

export function formatLabel(label: string, max = 8): string {
  // 超过 max 个字符按 max-1 截断 + "…"
  if (!label) return "";
  return label.length > max ? `${label.slice(0, Math.max(1, max - 1))}…` : label;
}

export function getNodeStyle(node: PositionedNode): Record<string, unknown> {
  const palette = NODE_PALETTE[node.type] ?? NODE_PALETTE.Entity;
  const isCenter = node.isCenter;
  const radius = isCenter ? 30 : node.layer === 1 ? 20 : 18;  // 中心最大、一跳中等、二跳略小
  return {
    x: node.x, y: node.y,
    size: radius * 2,
    fill: palette.fill,
    stroke: "#ffffff",
    lineWidth: 2,
    icon: true,
    iconText: palette.glyph,
    iconFill: "#ffffff",
    iconFontWeight: 700,
    iconFontSize: isCenter ? 18 : 14,
    label: true,
    labelText: formatLabel(node.label, 8),
    labelPlacement: "bottom",
    labelFill: "#334155",
    labelFontSize: 12,
    labelFontWeight: isCenter ? 700 : 500,
    labelBackground: true,
    labelBackgroundFill: "rgba(255, 255, 255, 0.9)",
    labelBackgroundStroke: "rgba(226, 232, 240, 0.85)",
    labelPadding: [3, 6],
    halo: isCenter,                         // 仅中心节点显示 halo
    haloStroke: palette.halo,
    haloStrokeOpacity: 0.25,
    haloLineWidth: 14,
  };
}

export function getEdgeStyle(edge: { isFirstHop: boolean; weight?: number }): Record<string, unknown> {
  return {
    stroke: edge.isFirstHop ? "#94a3b8" : "#cbd5e1",
    lineWidth: Math.min(2.2, Math.max(1, edge.weight ?? 1)),
    endArrow: true,
    endArrowType: "vee",
    endArrowSize: 7,
    label: edge.isFirstHop,                 // 仅 1 跳显示边标签
    labelText: edge.isFirstHop ? "" : "",   // 由调用方注入 labelText
    labelFill: "#64748b",
    labelFontSize: 10,
    labelPlacement: "center",
    labelAutoRotate: false,
    labelBackground: true,
    labelBackgroundFill: "rgba(255, 255, 255, 0.86)",
    labelBackgroundStroke: "rgba(226, 232, 240, 0.86)",
    labelPadding: [2, 5],
  };
}
```

### 步骤 5：实现 `graphLayout.ts` —— `buildDisplayGraph`

**布局策略：`preset` 模式 + 自计算坐标**（**不混用 G6 内置 radial**）

```
function buildDisplayGraph(input, centerId, maxNodes, maxEdges, width, height) {
  if (input.nodes.length === 0) return { nodes: [], edges: [], centerId: null };

  // 1) 选中心
  center = pickCenter(input, centerId);

  // 2) 建邻接表 + BFS 分层
  adjacency = buildAdjacency(input.edges);
  layers = bfs(center.id, adjacency, depth=2);  // { layer0:[center], layer1:[...], layer2:[...] }

  // 3) 数量限制（关键：1 跳和 2 跳都要限制）
  //    配额 = maxNodes - 1
  //    layer1 配额 = min(layer1.length, ceil(maxNodes * 0.55))  ← 1 跳优先
  //    layer2 配额 = min(layer2.length, maxNodes - 1 - layer1Quota)
  //    layer1/layer2 内部按 weight 降序截断
  const quota = computeLayerQuota(layers, maxNodes);
  const selected = { layer0: [center.id], layer1: topN(layers.layer1, quota.l1, weight), layer2: topN(layers.layer2, quota.l2, weight) };
  const selectedIds = new Set([...selected.layer0, ...selected.layer1, ...selected.layer2]);

  // 4) 计算坐标
  const cx = width / 2, cy = height / 2;
  const r1 = min(width, height) * 0.20;  // 一跳半径 ≈ 120-160px
  const r2 = min(width, height) * 0.38;  // 二跳半径 ≈ 240-320px
  const positions = {
    [center.id]: { x: cx, y: cy, layer: 0, rank: 0, isCenter: true },
  };
  distributeOnArc(selected.layer1, cx, cy, r1, layer=1);
  distributeOnArc(selected.layer2, cx, cy, r2, layer=2);

  // 5) 边收集：仅保留 source/target 都在 selectedIds 内；按 weight 截断到 maxEdges
  //    每条边标记 isFirstHop = (source or target == center.id)
  edges = filterAndTruncateEdges(input.edges, selectedIds, center.id, maxEdges);

  return { nodes, edges, centerId: center.id };
}
```

**`distributeOnArc`**：按角度均分，逆时针从 `-π/2`（12 点钟方向）开始；同 layer 内按 type 排序（Document/Entity 在前）使同类型节点相对聚集。

**G6 配置使用 `layout: { type: 'preset' }`**，不再叠加内置 radial，避免双重布局冲突。

### 步骤 6：实现 `graphEvents.ts` —— `bindGraphEvents`

**关键点**：`bindGraphEvents` **必须返回 unbind 函数**（dispose 模式），主组件在 unmount / graph 重建时调用以解绑全部事件。

```typescript
export function bindGraphEvents(
  graph: G6Graph,
  handlers: {
    onHover: (id: string | null) => void;
    onClick: (id: string) => void;
    onDblClick: (id: string) => void;
  }
): () => void {                      // ← 返回解绑函数
  const offEnter = graph.on('node:pointerenter', (e) => handlers.onHover(e.target.id));
  const offLeave = graph.on('node:pointerleave', () => handlers.onHover(null));
  const offClick = graph.on('node:click',       (e) => handlers.onClick(e.target.id));
  const offDbl   = graph.on('node:dblclick',    (e) => handlers.onDblClick(e.target.id));

  return () => {
    offEnter?.();
    offLeave?.();
    offClick?.();
    offDbl?.();
  };
}
```

**click / dblclick 防冲突**：
- 在 `useRef` 维护 `lastClickAtRef = useRef(0)`
- `onClick` 处理器：若距上次 dblclick 触发不足 250ms，忽略本次 click
- `onDblClick` 处理器：触发时记录 `lastClickAtRef.current = Date.now()`
- 这样 dblclick 时浏览器派发的两次 `click` 事件不会触发中心切换，避免「先切中心再扩展」的副作用

```typescript
const lastInteractionAt = useRef(0);
const handleClick = (id) => {
  if (Date.now() - lastInteractionAt.current < 300) return; // 300ms 内被 dblclick 抢先
  if (id === centerId) return;                              // 点击中心节点不切
  setCenterId(id);
  props.onCenterChange?.(id);
};
const handleDblClick = (id) => {
  lastInteractionAt.current = Date.now();
  props.onExpand?.(id);                                     // TODO: 联调扩展 API
};
```

**hover 高亮策略**（在主组件 `hoveredId` 变化时调用）：
```
graph.setElementState({
  [hoveredId]: 'hover',
  ...neighborIds.map(id => ({ [id]: 'related' })),
  // 其他节点和边设置为 'dim'
}, true);
```

G6 v5 的 `setElementState(states, drawOnce)` 第二个参数为 `true` 时会立即重绘，不排队。

### 步骤 7：实现 `KnowledgeGraph.tsx` 主组件

结构：

```typescript
export const KnowledgeGraph = forwardRef<GraphCanvasHandle, KnowledgeGraphProps>(
  function KnowledgeGraph(props, ref) {
    const shellRef = useRef<HTMLElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<G6Graph | null>(null);
    const unbindRef = useRef<(() => void) | null>(null);   // 持有 bindGraphEvents 的解绑函数
    const lastInteractionAt = useRef(0);                   // click/dblclick 防冲突时间戳
    const [size, setSize] = useState({ width: 900, height: 620 });
    const [centerId, setCenterId] = useState<string | undefined>(props.centerNodeId);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [zoomLabel, setZoomLabel] = useState("100%");

    // 1) 容器尺寸
    useResizeObserver(shellRef, setSize);

    // 2) 计算展示图
    const display = useMemo(
      () => buildDisplayGraph(props.graph, centerId, props.maxNodes, props.maxEdges, size.width, size.height),
      [props.graph, centerId, props.maxNodes, props.maxEdges, size.width, size.height]
    );

    // 3) 挂载/更新 G6
    useEffect(() => {
      const unbind = mountOrUpdateGraph(display, size, canvasRef, graphRef, {
        onHover: setHoveredId,
        onClick: handleClick,
        onDblClick: handleDblClick,
      });
      unbindRef.current = unbind;   // 保存解绑函数
      return () => { unbind(); unbindRef.current = null; };
    }, [display, size]);

    // 4) hover 状态变化时刷高亮
    useEffect(() => { applyHoverHighlight(graphRef.current, hoveredId, display); }, [hoveredId, display]);

    // 5) 卸载：先解绑事件，再 destroy 图实例
    useEffect(() => () => {
      unbindRef.current?.();
      unbindRef.current = null;
      graphRef.current?.destroy();
      graphRef.current = null;
    }, []);

    // 6) 对外暴露 fit / exportPng（与旧签名一致）
    useImperativeHandle(ref, () => ({ fit, exportPng }), [...]);

    return <section>...<canvas /> 工具条 / Legend / 空态</section>;
  }
);
```

**`mountOrUpdateGraph` 返回解绑函数**（unbind dispose 模式），外层 useEffect 清理时调用：
```typescript
async function mountOrUpdateGraph(display, size, canvas, graphRef, handlers): Promise<() => void> {
  if (!canvas.current || display.nodes.length === 0) return () => {};
  if (!graphRef.current) {
    const { Graph } = await import("@antv/g6");
    graphRef.current = new Graph({
      container: canvas.current, width: size.width, height: size.height,
      autoFit: 'view', animation: false,
      data: toG6Data(display),
      node: { type: 'circle', style: (d) => d.style, state: { hover: {...}, related: {...}, dim: {...} } },
      edge: { type: 'line',   style: (d) => d.style, state: { hover: {...}, related: {...}, dim: {...} } },
      behaviors: ['drag-canvas','zoom-canvas','drag-element'],
      layout: { type: 'preset' },     // ← 用 preset，不再用 G6 内置 radial
    });
    return bindGraphEvents(graphRef.current, handlers);   // 返回 unbind
  } else {
    graphRef.current.resize(size.width, size.height);
    graphRef.current.setData(toG6Data(display));
    return () => {};   // 已绑过的事件不需要重复绑
  }
}
```

### 步骤 8：替换 `GraphCanvas.tsx` 为薄壳 + 兼容导出

```typescript
// apps/web/src/components/graph/GraphCanvas.tsx
export { KnowledgeGraph as GraphCanvas } from "./knowledgeGraph/KnowledgeGraph";
export type { KnowledgeGraphProps as GraphCanvasProps } from "./knowledgeGraph/types";
// GraphCanvasHandle 仍由 KnowledgeGraph 通过 useImperativeHandle 暴露
```

这样 `graph/page.tsx` 的 import 路径完全不变。

### 步骤 9：CSS 样式

不需要单独 CSS 文件，沿用 Tailwind。在 `KnowledgeGraph.tsx` 中：
- 容器 `relative h-[560px] ... xl:h-[calc(100vh-180px)]`
- 节点/边由 G6 内联样式控制
- Legend 块沿用现版本的 `LegendDot` 组件，并扩充加入"中心节点"图例项

## 5. 关键文件清单

| 操作 | 路径 |
|------|------|
| 修改 | [apps/web/src/types/api/graph.ts](file:///i:/ai-knowledge/apps/web/src/types/api/graph.ts) - 扩展 `GraphNode.type` |
| 新建 | [apps/web/src/components/graph/knowledgeGraph/types.ts](file:///i:/ai-knowledge/apps/web/src/components/graph/knowledgeGraph/types.ts) |
| 新建 | [apps/web/src/components/graph/knowledgeGraph/style.ts](file:///i:/ai-knowledge/apps/web/src/components/graph/knowledgeGraph/style.ts) |
| 新建 | [apps/web/src/components/graph/knowledgeGraph/graphLayout.ts](file:///i:/ai-knowledge/apps/web/src/components/graph/knowledgeGraph/graphLayout.ts) |
| 新建 | [apps/web/src/components/graph/knowledgeGraph/graphEvents.ts](file:///i:/ai-knowledge/apps/web/src/components/graph/knowledgeGraph/graphEvents.ts) |
| 新建 | [apps/web/src/components/graph/knowledgeGraph/KnowledgeGraph.tsx](file:///i:/ai-knowledge/apps/web/src/components/graph/knowledgeGraph/KnowledgeGraph.tsx) |
| 新建 | [apps/web/src/components/graph/knowledgeGraph/index.ts](file:///i:/ai-knowledge/apps/web/src/components/graph/knowledgeGraph/index.ts) |
| 修改 | [apps/web/src/components/graph/GraphCanvas.tsx](file:///i:/ai-knowledge/apps/web/src/components/graph/GraphCanvas.tsx) - 改为薄壳 re-export |

## 6. API 调用占位

在以下位置加 `// TODO:` 注释：
- `onClick` 触发 `onCenterChange` 后，本地切换中心；如需拉取新数据：调用 `searchGraph({ keyword: nodeLabel, depth: 2, limit: 32 })`
- `onDblClick` 触发 `onExpand`：调用 `getGraphWorkspace({ keyword: nodeLabel, depth: 3 })` 并把返回的图合并到当前图

## 7. 验证步骤

1. `pnpm --filter @ai-knowledge/web run build` 通过无 TS 错误
2. 打开 `http://localhost:3000/graph`：
   - 默认无中心 → 自动选最高权重节点为中心
   - 中心节点明显大于其他节点
   - 1 跳节点呈内环分布，2 跳节点呈外环分布
   - hover 中心节点：相邻节点 + 边高亮，其他淡化
   - click 任意 1 跳节点：该节点变新中心，辐射重新计算
   - dblclick 节点：控制台打印 `// TODO expand` 日志
   - 拖拽/缩放/适配视图按钮正常工作
3. 节点数量 ≤ 35、边数量 ≤ 60（搜索栏打印 stats 可验证）
4. 图例颜色与节点颜色一致

## 8. 风险与回退

- **`preset` 模式坐标精度**：自计算的 (x, y) 需保证节点不重叠；`distributeOnArc` 已做均分 + type 聚类，但极端 case（1 跳节点数 > 18）时仍可能拥挤。缓解：1 跳配额上限设为 `ceil(maxNodes * 0.55)`，默认不超过 19 个；2 跳半径动态放大（节点越多半径越大）。
- **setElementState 性能**：节点 ≤ 35 时性能无压力；超过 100 时需改用 `setElementData` 增量更新。
- **类型扩展向后兼容**：`GraphNode.type` 增加 `Category` 不影响现有 TS 代码（union 是加项）。
- **事件解绑与 useEffect 清理顺序**：组件 unmount 时必须先 `unbindRef.current?.()` 再 `graphRef.current?.destroy()`，否则 G6 内部可能在 destroy 后仍触发事件，抛 null 异常。已在新主组件代码中明确顺序。
