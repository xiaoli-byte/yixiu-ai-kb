import { describe, expect, it, vi } from "vitest";
import { QaController } from "./qa.controller";

function createFixture() {
  const stream = {
    on: vi.fn().mockReturnThis(),
    pipe: vi.fn(),
  };
  const qa = {
    getDocumentFile: vi.fn().mockResolvedValue({
      title: "中文资料 (终稿).pdf",
      mime: "application/pdf",
      stream,
    }),
  };
  const db = { tenantId: "tenant-1" };
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    destroy: vi.fn(),
    headersSent: false,
  };
  const controller = new QaController(qa as never, db as never);

  return { controller, db, qa, response, stream };
}

describe("QaController document file response", () => {
  it.each([
    [undefined, "inline"],
    ["0", "inline"],
    ["1", "attachment"],
  ])("uses %s as the download flag for %s disposition", async (download, disposition) => {
    const { controller, db, qa, response, stream } = createFixture();
    const user = { sub: "user-1" };

    await controller.getDocumentFile("document-1", user, download, response as never);

    expect(qa.getDocumentFile).toHaveBeenCalledWith(
      "document-1",
      db.tenantId,
      user,
      disposition === "attachment" ? "DOWNLOAD" : "VIEW",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      `${disposition}; filename="____ (__).pdf"; filename*=UTF-8''%E4%B8%AD%E6%96%87%E8%B5%84%E6%96%99%20%28%E7%BB%88%E7%A8%BF%29.pdf`,
    );
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(stream.pipe).toHaveBeenCalledWith(response);
  });
});
