import assert from "node:assert/strict";
import {
  canonicalKey,
  chunkHash,
  contentHash,
  edgeKey,
  evidenceHash,
  normalizeContentText,
} from "../src/common/dedup/canonical";

assert.equal(canonicalKey("Concept", " 微信 "), canonicalKey("concept", "「微信」"));
assert.equal(canonicalKey("Org", "A  B"), "org:a b");
assert.equal(contentHash("hello\r\n\r\n\r\nworld"), contentHash("hello\n\nworld"));
assert.equal(chunkHash("  same chunk  "), chunkHash("same chunk"));
assert.equal(
  edgeKey(canonicalKey("Concept", "微信"), "包含", canonicalKey("Concept", "支付")),
  edgeKey(canonicalKey("concept", "「微信」"), " 包含 ", canonicalKey("concept", "支付")),
);
assert.equal(
  evidenceHash(["edge-1", "content-1", "chunk-1", normalizeContentText("证据\n文本")]),
  evidenceHash(["edge-1", "content-1", "chunk-1", "证据\n文本"]),
);

console.log("Dedup canonical checks passed.");
