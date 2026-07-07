import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../client";
import {
  batchDocuments,
  getDocumentPermissions,
  retryParse,
  setBatchPermissions,
  setDocumentPermissions,
} from "./documents";
import {
  batchDocuments as serviceBatchDocuments,
  getPermissions as serviceGetPermissions,
  retryParse as serviceRetryParse,
  setBatchPermissions as serviceSetBatchPermissions,
  setPermissions as serviceSetPermissions,
} from "@/services/documents";

vi.mock("../client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("document endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets document permissions", async () => {
    const response = {
      documentId: "doc-1",
      permissionScope: "COMPANY",
      entries: [],
      searchable: true,
      aiReferenceEnabled: true,
    };
    vi.mocked(apiClient.get).mockResolvedValueOnce(response);

    const result = await getDocumentPermissions("doc-1");

    expect(apiClient.get).toHaveBeenCalledWith("/documents/doc-1/permissions");
    expect(result).toEqual(response);
  });

  it("sets document permissions", async () => {
    const response = {
      documentId: "doc-1",
      permissionScope: "COMPANY",
      entries: [],
      searchable: true,
      aiReferenceEnabled: true,
    };
    vi.mocked(apiClient.put).mockResolvedValueOnce(response);
    const body = { permissionScope: "COMPANY" as const, entries: [] };

    const result = await setDocumentPermissions("doc-1", body);

    expect(apiClient.put).toHaveBeenCalledWith("/documents/doc-1/permissions", body);
    expect(result).toEqual(response);
  });

  it("posts batch document operations", async () => {
    const response = {
      action: "ARCHIVE",
      results: [
        { documentId: "doc-1", ok: true },
        { documentId: "doc-2", ok: false, message: "denied" },
      ],
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(response);
    const body = { action: "ARCHIVE" as const, documentIds: ["doc-1", "doc-2"] };

    const result = await batchDocuments(body);

    expect(apiClient.post).toHaveBeenCalledWith("/documents/batch", body);
    expect(result).toEqual(response);
  });

  it("puts batch document permissions", async () => {
    const response = {
      results: [
        { documentId: "doc-1", ok: true },
        { documentId: "doc-2", ok: false, message: "denied" },
      ],
    };
    vi.mocked(apiClient.put).mockResolvedValueOnce(response);
    const body = { documentIds: ["doc-1"], permissionScope: "COMPANY" as const, entries: [] };

    const result = await setBatchPermissions(body);

    expect(apiClient.put).toHaveBeenCalledWith("/documents/batch/permissions", body);
    expect(result).toEqual(response);
  });

  it("posts parse retry requests", async () => {
    const response = { id: "doc-1", status: "PENDING" };
    vi.mocked(apiClient.post).mockResolvedValueOnce(response);

    const result = await retryParse("doc-1");

    expect(apiClient.post).toHaveBeenCalledWith("/documents/doc-1/parse/retry");
    expect(result).toEqual(response);
  });

  it("re-exports document wrappers through the documents service", () => {
    expect(serviceBatchDocuments).toBe(batchDocuments);
    expect(serviceSetBatchPermissions).toBe(setBatchPermissions);
    expect(serviceRetryParse).toBe(retryParse);
    expect(serviceGetPermissions).toBe(getDocumentPermissions);
    expect(serviceSetPermissions).toBe(setDocumentPermissions);
  });

  it("declares document endpoint response contracts matching the backend", () => {
    const types = readFileSync(join(process.cwd(), "apps/web/src/types/api/documents.ts"), "utf8");
    const endpoints = readFileSync(join(process.cwd(), "apps/web/src/lib/api/endpoints/documents.ts"), "utf8");

    expect(types).toMatch(/interface DocumentPermissionResponse \{[^}]*documentId: string;/);
    expect(types).toMatch(/interface DocumentBatchOperationResult \{[^}]*documentId: string;[^}]*ok: boolean;[^}]*message\?: string;/);
    expect(types).not.toContain("success: boolean;");
    expect(types).not.toContain("error?: string;");
    expect(types).toMatch(/interface DocumentParseRetryResponse \{[^}]*id: string;[^}]*status: DocumentStatus;/);
    expect(endpoints).toContain("Promise<DocumentParseRetryResponse>");
    expect(endpoints).toContain("apiClient.post<DocumentParseRetryResponse>");
  });
});
