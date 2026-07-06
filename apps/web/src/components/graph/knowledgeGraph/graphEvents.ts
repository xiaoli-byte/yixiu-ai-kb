import type { GraphInteractionHandlers } from "./types";

type G6EventTarget = { id?: string };
type G6EventHandler = (e: { target: G6EventTarget }) => void;

type G6GraphLike = {
  on: (event: string, handler: G6EventHandler) => unknown;
  off: (event: string, handler: G6EventHandler) => void;
};

export function bindGraphEvents(
  graph: G6GraphLike,
  handlers: GraphInteractionHandlers,
): () => void {
  const handleEnter: G6EventHandler = (e) => {
    if (e?.target?.id) handlers.onHover(e.target.id);
  };
  const handleLeave: G6EventHandler = () => handlers.onHover(null);
  const handleClick: G6EventHandler = (e) => {
    if (e?.target?.id) handlers.onClick(e.target.id);
  };
  const handleDbl: G6EventHandler = (e) => {
    if (e?.target?.id) handlers.onDblClick(e.target.id);
  };
  const handleEdgeClick: G6EventHandler = (e) => {
    if (e?.target?.id) handlers.onEdgeClick?.(e.target.id);
  };

  graph.on("node:pointerenter", handleEnter);
  graph.on("node:pointerleave", handleLeave);
  graph.on("node:click", handleClick);
  graph.on("node:dblclick", handleDbl);
  graph.on("edge:click", handleEdgeClick);

  return () => {
    graph.off("node:pointerenter", handleEnter);
    graph.off("node:pointerleave", handleLeave);
    graph.off("node:click", handleClick);
    graph.off("node:dblclick", handleDbl);
    graph.off("edge:click", handleEdgeClick);
  };
}
