import { describe, it, expect } from "vitest";
import { buildBrandToneSuffix } from "./brand-tone";

describe("buildBrandToneSuffix", () => {
  it("returns empty string for missing user id", async () => {
    const out = await buildBrandToneSuffix(null as unknown as number);
    expect(out).toBe("");
  });

  it("never throws for non-existent user id", async () => {
    const out = await buildBrandToneSuffix(999_999_999);
    expect(typeof out).toBe("string");
  });
});
