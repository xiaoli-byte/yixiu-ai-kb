import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../client";
import {
  buildDocumentDownloadUrl,
  buildDocumentFileUrl,
  buildMessageFeedbackPayload,
  getDocumentFileBlob,
  updateMessageFeedback,
} from "./qa";

vi.mock("../client", () => ({
  apiBaseUrl: "/api",
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    getBlob: vi.fn(),
    patch: vi.fn(),
  },
}));

describe("QA feedback endpoint", () => {
  it("trims text feedback and sends the PATCH payload", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      rating: "down",
      text: "Needs a source",
      updatedAt: "2026-07-07T01:02:03.000Z",
    });

    const result = await updateMessageFeedback("msg-1", {
      rating: "down",
      feedbackText: "  Needs a source  ",
    });

    expect(apiClient.patch).toHaveBeenCalledWith("/qa/messages/msg-1/feedback", {
      rating: "down",
      feedbackText: "Needs a source",
    });
    expect(result.rating).toBe("down");
  });

  it("omits note text when clearing feedback", () => {
    expect(
      buildMessageFeedbackPayload({
        rating: "none",
        feedbackText: "no longer needed",
      }),
    ).toEqual({ rating: "none" });
  });
});

describe("QA document file URLs", () => {
  it("builds distinct preview and attachment download URLs", () => {
    expect(buildDocumentFileUrl("文档/id")).toBe(
      "/api/qa/documents/%E6%96%87%E6%A1%A3%2Fid/file",
    );
    expect(buildDocumentDownloadUrl("文档/id")).toBe(
      "/api/qa/documents/%E6%96%87%E6%A1%A3%2Fid/file?download=1",
    );
  });

  it("fetches protected preview and download files through the authenticated client", async () => {
    const blob = new Blob(["pdf"]);
    vi.mocked(apiClient.getBlob).mockResolvedValue(blob);

    await expect(getDocumentFileBlob("文档/id")).resolves.toBe(blob);
    expect(apiClient.getBlob).toHaveBeenLastCalledWith(
      "/qa/documents/%E6%96%87%E6%A1%A3%2Fid/file",
      { query: undefined },
    );

    await getDocumentFileBlob("文档/id", { download: true });
    expect(apiClient.getBlob).toHaveBeenLastCalledWith(
      "/qa/documents/%E6%96%87%E6%A1%A3%2Fid/file",
      { query: { download: 1 } },
    );
  });
});
