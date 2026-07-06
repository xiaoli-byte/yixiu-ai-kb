import type { GraphNodeType, PositionedNode } from "./types";

interface PaletteEntry {
  fill: string;
  soft: string;
  halo: string;
  glyph: string;
  legend: string;
}

export const NODE_PALETTE: Record<GraphNodeType, PaletteEntry> = {
  Document: {
    fill: "#2563eb",
    soft: "#eff6ff",
    halo: "#2563eb",
    glyph: "文",
    legend: "文档",
  },
  Entity: {
    fill: "#059669",
    soft: "#ecfdf5",
    halo: "#059669",
    glyph: "知",
    legend: "知识点",
  },
  Tag: {
    fill: "#7c3aed",
    soft: "#f5f3ff",
    halo: "#7c3aed",
    glyph: "标",
    legend: "标签",
  },
  Category: {
    fill: "#d97706",
    soft: "#fffbeb",
    halo: "#d97706",
    glyph: "类",
    legend: "业务分类",
  },
  Chunk: {
    fill: "#64748b",
    soft: "#f8fafc",
    halo: "#64748b",
    glyph: "段",
    legend: "段落",
  },
};

export const LEGEND_ITEMS: Array<{
  type: GraphNodeType;
  label: string;
  color: string;
}> = [
  { type: "Document", label: NODE_PALETTE.Document.legend, color: NODE_PALETTE.Document.fill },
  { type: "Entity", label: NODE_PALETTE.Entity.legend, color: NODE_PALETTE.Entity.fill },
  { type: "Tag", label: NODE_PALETTE.Tag.legend, color: NODE_PALETTE.Tag.fill },
  { type: "Category", label: NODE_PALETTE.Category.legend, color: NODE_PALETTE.Category.fill },
];

export function formatLabel(label: string, max = 8): string {
  if (!label) return "";
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(1, max - 1))}…`;
}

export function getNodeStyle(node: PositionedNode): Record<string, unknown> {
  const palette = NODE_PALETTE[node.type] ?? NODE_PALETTE.Entity;
  const isCenter = node.isCenter;
  const radius = isCenter ? 30 : node.layer === 1 ? 22 : 18;

  return {
    x: node.x,
    y: node.y,
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
    labelBackgroundFill: "rgba(255, 255, 255, 0.92)",
    labelBackgroundStroke: "rgba(226, 232, 240, 0.85)",
    labelBackgroundLineWidth: 1,
    labelPadding: [3, 6],
    halo: isCenter,
    haloStroke: palette.halo,
    haloStrokeOpacity: 0.25,
    haloLineWidth: 14,
  };
}

export function getEdgeStyle(args: {
  isFirstHop: boolean;
  weight?: number;
  label: string;
}): Record<string, unknown> {
  return {
    stroke: args.isFirstHop ? "#94a3b8" : "#cbd5e1",
    lineWidth: Math.min(2.2, Math.max(1, args.weight ?? 1)),
    endArrow: true,
    endArrowType: "vee",
    endArrowSize: 7,
    label: args.isFirstHop && Boolean(args.label),
    labelText: args.isFirstHop ? formatLabel(args.label, 8) : "",
    labelFill: "#64748b",
    labelFontSize: 10,
    labelPlacement: "center",
    labelAutoRotate: false,
    labelBackground: args.isFirstHop,
    labelBackgroundFill: "rgba(255, 255, 255, 0.9)",
    labelBackgroundStroke: "rgba(226, 232, 240, 0.86)",
    labelBackgroundLineWidth: 1,
    labelPadding: [2, 5],
  };
}
