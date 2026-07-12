import { describe, expect, it } from "vitest";
import { getEdgeStyle, getNodeStyle } from "./style";
import type { PositionedNode } from "./types";

describe("knowledge graph style", () => {
  it("sets base opacity so dim state can visually recover", () => {
    const node: PositionedNode = {
      id: "n1",
      label: "Node",
      type: "Entity",
      properties: {},
      x: 120,
      y: 90,
      layer: 1,
      rank: 0,
      isCenter: false,
    };

    expect(getNodeStyle(node).opacity).toBe(1);
    expect(
      getEdgeStyle({
        isFirstHop: true,
        label: "RELATED",
        weight: 1,
      }).opacity,
    ).toBe(1);
  });
});
