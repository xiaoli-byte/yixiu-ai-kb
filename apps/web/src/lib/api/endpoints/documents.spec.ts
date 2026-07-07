import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../client";
import {
  batchDocuments,
  getDocumentPermissions,
  retryParse,
  setBatchPermissions,
  setDocumentPermissions,
} from "./documents";

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
    vi.mocked(apiClient.get).mockResolvedValueOnce({ permissionScope: "COMPANY", entries: [] });

    await getDocumentPermissions("doc-1");

    expect(apiClient.get).toHaveBeenCalledWith("/documents/doc-1/permissions");
  });

  it("sets document permissions", async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({ permissionScope: "COMPANY", entries: [] });
    const body = { permissionScope: "COMPANY" as const, entries: [] };

    await setDocumentPermissions("doc-1", body);

    expect(apiClient.put).toHaveBeenCalledWith("/documents/doc-1/permissions", body);
  });

  it("posts batch document operations", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ results: [] });
    const body = { action: "ARCHIVE" as const, documentIds: ["doc-1", "doc-2"] };

    await batchDocuments(body);

    expect(apiClient.post).toHaveBeenCalledWith("/documents/batch", body);
  });

  it("puts batch document permissions", async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({ results: [] });
    const body = { documentIds: ["doc-1"], permissionScope: "COMPANY" as const, entries: [] };

    await setBatchPermissions(body);

    expect(apiClient.put).toHaveBeenCalledWith("/documents/batch/permissions", body);
  });

  it("posts parse retry requests", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ queued: true });

    await retryParse("doc-1");

    expect(apiClient.post).toHaveBeenCalledWith("/documents/doc-1/parse/retry");
  });
});
