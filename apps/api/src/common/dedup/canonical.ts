import { createHash } from "crypto";

const PUNCTUATION_RE =
  /[\u0000-\u001f\u007f"'\`“”‘’「」『』《》〈〉（）()\[\]{}【】,，.。;；:：!！?？、\\/|·•…\-—–_~^+*=<>]/g;

export function sha256Hex(input: Buffer | string) {
  return createHash("sha256").update(input).digest("hex");
}

export function normalizeContentText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function contentHash(text: string) {
  return sha256Hex(normalizeContentText(text));
}

export function chunkHash(text: string) {
  return sha256Hex(normalizeContentText(text));
}

export function normalizeCanonicalPart(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(PUNCTUATION_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalKey(type: string, name: string) {
  const normalizedType = normalizeCanonicalPart(type || "Concept") || "concept";
  const normalizedName = normalizeCanonicalPart(name);
  return `${normalizedType}:${normalizedName}`;
}

export function relationKeyPart(type: string) {
  return normalizeCanonicalPart(type || "RELATED").replace(/\s+/g, "_") || "related";
}

export function knowledgeNodeId(tenantId: string, key: string) {
  return `kn-${tenantId}-${sha256Hex(key).slice(0, 32)}`;
}

export function edgeKey(sourceCanonicalKey: string, relationType: string, targetCanonicalKey: string) {
  return [sourceCanonicalKey, relationKeyPart(relationType), targetCanonicalKey].join("|");
}

export function evidenceHash(parts: Array<string | null | undefined>) {
  return sha256Hex(parts.map((part) => normalizeContentText(String(part || ""))).join("|"));
}

export function factHash(input: {
  domain: string;
  entityType: string;
  entityName: string;
  attributes?: unknown;
  sourceText: string;
}) {
  return sha256Hex(
    [
      normalizeCanonicalPart(input.domain),
      normalizeCanonicalPart(input.entityType),
      normalizeCanonicalPart(input.entityName),
      normalizeContentText(JSON.stringify(input.attributes || {})),
      normalizeContentText(input.sourceText),
    ].join("|"),
  );
}
