import { describe, expect, it, vi } from "vitest";
import { bindGraphEvents } from "./graphEvents";

type Handler = (event: { target: { id?: string }; targetType?: string }) => void;

function createGraphMock() {
  const handlers = new Map<string, Handler>();

  return {
    handlers,
    graph: {
      on: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, handler);
      }),
      off: vi.fn((event: string, handler: Handler) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      }),
    },
  };
}

describe("bindGraphEvents", () => {
  it("keeps hover active while the pointer moves inside a node", () => {
    const { graph, handlers } = createGraphMock();
    const onHover = vi.fn();

    bindGraphEvents(graph, {
      onHover,
      onClick: vi.fn(),
      onDblClick: vi.fn(),
    });

    handlers.get("node:pointerenter")?.({ target: { id: "a" }, targetType: "node" });
    handlers.get("node:pointermove")?.({ target: { id: "a" }, targetType: "node" });

    expect(onHover).toHaveBeenNthCalledWith(1, "a");
    expect(onHover).toHaveBeenNthCalledWith(2, "a");
    expect(handlers.has("node:pointerout")).toBe(false);
  });

  it("clears hover when the pointer moves over the canvas", () => {
    const { graph, handlers } = createGraphMock();
    const onHover = vi.fn();

    bindGraphEvents(graph, {
      onHover,
      onClick: vi.fn(),
      onDblClick: vi.fn(),
    });

    handlers.get("canvas:pointermove")?.({ target: {}, targetType: "canvas" });
    handlers.get("canvas:pointermove")?.({ target: { id: "a" }, targetType: "node" });

    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledWith(null);
  });
});
