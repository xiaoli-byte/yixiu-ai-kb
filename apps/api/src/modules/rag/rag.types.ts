import type { SearchHit } from "../search/search.service";

export type RagDomain =
  | "default"
  | "resume"
  | "ecommerce"
  | "ktv"
  | "foreign_trade"
  | "crm"
  | "medical"
  | "collection";

export type RagIntent =
  | "factual"
  | "timeline"
  | "calculation"
  | "comparison"
  | "summary"
  | "compliance_risk"
  | "open_qa";

export type RagRiskLevel = "low" | "medium" | "high";

export interface DomainProfile {
  domain: RagDomain;
  displayName: string;
  riskLevel: RagRiskLevel;
  retrievalBoostTerms: string[];
  factEntityTypes: string[];
  tools: string[];
  answerPolicy: string[];
}

export interface RagRoute {
  originalQuestion: string;
  retrievalQuery: string;
  domain: RagDomain;
  intent: RagIntent;
  profile: DomainProfile;
  requiresFacts: boolean;
  requiresTool: boolean;
  warnings: string[];
}

export interface StructuredFactInput {
  tenantId: string;
  documentId: string;
  chunkId?: string | null;
  domain: RagDomain;
  entityType: string;
  entityName: string;
  attributes: Record<string, unknown>;
  confidence: number;
  sourceText: string;
}

export interface StructuredFact extends StructuredFactInput {
  id: string;
  documentTitle?: string;
  mime?: string;
  page?: number | null;
  createdAt?: Date;
}

export interface RagToolEvidence {
  factId?: string;
  chunkId?: string | null;
  documentId?: string;
  documentTitle?: string;
  sourceText: string;
}

export interface RagToolResult {
  name: string;
  summary: string;
  confidence: number;
  data: Record<string, unknown>;
  evidence: RagToolEvidence[];
}

export interface QaRunLogInput {
  tenantId: string;
  userId?: string;
  conversationId?: string;
  question: string;
  rewrittenQuery?: string;
  intent: RagIntent;
  domain: RagDomain;
  facts?: StructuredFact[];
  chunks?: SearchHit[];
  toolResult?: RagToolResult | null;
  answer?: string;
  error?: string;
}

export interface FactExtractionChunk {
  id: string;
  text: string;
  page?: number | null;
}
