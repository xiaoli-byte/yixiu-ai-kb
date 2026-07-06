import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../client";
import { buildMessageFeedbackPayload, updateMessageFeedback } from "./qa";

vi.mock("../client", () => ({
  apiBaseUrl: "/api",
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
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
