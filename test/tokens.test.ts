import { describe, expect, it } from "vitest";
import { estimateTokens, formatTokens } from "../src/core/text.js";

describe("token estimation", () => {
  it("estimates ~4 characters per token", () => {
    expect(estimateTokens("abcd".repeat(100))).toBe(100);
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("")).toBe(0);
  });

  it("formats counts compactly", () => {
    expect(formatTokens(850)).toBe("850");
    expect(formatTokens(4200)).toBe("4.2k");
    expect(formatTokens(38000)).toBe("38.0k");
  });
});
