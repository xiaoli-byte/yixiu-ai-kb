import { describe, expect, it } from "vitest";
import { buildGraphElementStates } from "./graphState";
import type { DisplayGraph } from "./types";

const display: DisplayGraph = {
  centerId: "a",
  nodes: [
    {
      id: "a",
      data: { label: "Alpha", type: "Entity", isCenter: true, layer: 0 },
      style: {},
    },
    {
      id: "b",
      data: { label: "Beta", type: "Entity", isCenter: false, layer: 1 },
      style: {},
    },
    {
      id: "c",
      data: { label: "Gamma", type: "Tag", isCenter: false, layer: 2 },
      style: {},
    },
  ],
  edges: [
    {
      id: "a-b",
      source: "a",
      target: "b",
      data: { label: "RELATED", isFirstHop: true },
      style: {},
    },
    {
      id: "b-c",
      source: "b",
      target: "c",
      data: { label: "TAGGED", isFirstHop: false },
      style: {},
    },
  ],
};

describe("buildGraphElementStates", () => {
  it("dims unrelated elements while hovering a node", () => {
    expect(
      buildGraphElementStates({
        display,
        hoveredId: "a",
      }),
    ).toEqual({
      a: ["hover"],
      b: ["related"],
      c: ["dim"],
      "a-b": ["hover"],
      "b-c": ["dim"],
    });
  });

  it("returns empty states for every element after hover leaves", () => {
    expect(
      buildGraphElementStates({
        display,
        hoveredId: null,
      }),
    ).toEqual({
      a: [],
      b: [],
      c: [],
      "a-b": [],
      "b-c": [],
    });
  });

  it("keeps selected and highlighted elements protected from dimming", () => {
    expect(
      buildGraphElementStates({
        display,
        hoveredId: "a",
        selectedNodeId: "c",
        highlightEdgeIds: ["b-c"],
      }),
    ).toEqual({
      a: ["hover"],
      b: ["related"],
      c: ["selected"],
      "a-b": ["hover"],
      "b-c": ["highlighted"],
    });
  });
});
