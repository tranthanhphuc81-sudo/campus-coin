import { describe, expect, it } from "vitest";

import { normalizeMerchantKey, scrubPii } from "./normalize.js";

describe("AI normalize utilities", () => {
  it("normalizes accented merchant text and removes numbers", () => {
    expect(normalizeMerchantKey("Campus Café #12")).toBe("campus cafe");
  });

  it("scrubs email phone and long numbers in order", () => {
    const output = scrubPii(
      "mail me at test@example.com or +84 912 345 678 card 1234 5678 9012 3456",
    );
    expect(output).toContain("[EMAIL]");
    expect(output).toContain("[PHONE]");
    expect(output).toContain("[NUMBER]");
  });
});
