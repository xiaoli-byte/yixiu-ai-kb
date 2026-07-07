import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TagsController } from "./tags.controller";

const user = {
  sub: "user-1",
  tenantId: "tenant-1",
  role: "editor",
  departmentId: "dept-1",
};

function createController() {
  const tags = {
    addTagToDocument: vi.fn().mockResolvedValue({ documentId: "doc-1", tagId: "tag-1" }),
    removeTagFromDocument: vi.fn().mockResolvedValue({ documentId: "doc-1", tagId: "tag-1" }),
    getDocumentTags: vi.fn().mockResolvedValue([{ id: "tag-1", name: "Policy" }]),
  };
  const access = {
    assertDocumentAccess: vi.fn().mockResolvedValue(undefined),
  };
  const controller = new (TagsController as any)(tags, access) as TagsController;

  return { controller, tags, access };
}

describe("TagsController document tag access", () => {
  it("checks VIEW access before reading document tags", async () => {
    const { controller, tags, access } = createController();

    await expect((controller as any).getDocumentTags("doc-1", user)).resolves.toEqual([
      { id: "tag-1", name: "Policy" },
    ]);

    expect(access.assertDocumentAccess).toHaveBeenCalledWith("doc-1", "VIEW", {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "editor",
      departmentId: "dept-1",
    });
    expect(tags.getDocumentTags).toHaveBeenCalledWith("doc-1");
  });

  it("checks EDIT access before adding or removing document tags", async () => {
    const { controller, tags, access } = createController();

    await expect((controller as any).addTagToDocument("doc-1", "tag-1", user)).resolves.toEqual({
      documentId: "doc-1",
      tagId: "tag-1",
    });
    await expect((controller as any).removeTagFromDocument("doc-1", "tag-1", user)).resolves.toEqual({
      documentId: "doc-1",
      tagId: "tag-1",
    });

    expect(access.assertDocumentAccess).toHaveBeenCalledWith("doc-1", "EDIT", {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "editor",
      departmentId: "dept-1",
    });
    expect(access.assertDocumentAccess).toHaveBeenCalledTimes(2);
    expect(tags.addTagToDocument).toHaveBeenCalledWith("doc-1", "tag-1");
    expect(tags.removeTagFromDocument).toHaveBeenCalledWith("doc-1", "tag-1");
  });

  it("does not mutate document tags when EDIT access is denied", async () => {
    const { controller, tags, access } = createController();
    access.assertDocumentAccess.mockRejectedValue(new ForbiddenException("denied"));

    await expect((controller as any).addTagToDocument("doc-1", "tag-1", user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect((controller as any).removeTagFromDocument("doc-1", "tag-1", user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(tags.addTagToDocument).not.toHaveBeenCalled();
    expect(tags.removeTagFromDocument).not.toHaveBeenCalled();
  });
});
