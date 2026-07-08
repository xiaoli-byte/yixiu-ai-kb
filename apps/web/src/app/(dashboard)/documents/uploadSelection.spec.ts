import { describe, expect, it } from "vitest";
import { mergeUploadFiles } from "./uploadSelection";

type TestFile = {
  name: string;
  size: number;
  lastModified: number;
};

function file(name: string, size: number, lastModified: number): TestFile {
  return { name, size, lastModified };
}

describe("document upload selection", () => {
  it("appends files chosen in later picker sessions", () => {
    const first = file("prd.pdf", 1024, 1);
    const second = file("design.png", 2048, 2);

    expect(mergeUploadFiles([first], [second])).toEqual([first, second]);
  });

  it("keeps the existing file when the same file is selected again", () => {
    const first = file("prd.pdf", 1024, 1);
    const duplicate = file("prd.pdf", 1024, 1);

    expect(mergeUploadFiles([first], [duplicate])).toEqual([first]);
  });
});
