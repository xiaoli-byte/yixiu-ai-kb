import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const graphPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("GraphPage temporary sidebar visibility", () => {
  it("does not render saved views or path/relation tools", () => {
    expect(graphPageSource).not.toContain("GraphSavedViews");
    expect(graphPageSource).not.toContain("GraphPathPanel");
  });
});
