import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./_core/rateLimit";

describe("rate limiter", () => {
  it("allows up to the limit then blocks", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("opens again after the window passes", () => {
    const limiter = createRateLimiter(1, 100);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    // The window slides by timestamp; simulate by waiting out the window.
    const wait = new Promise((resolve) => setTimeout(resolve, 120));
    return wait.then(() => {
      expect(limiter.allow("a")).toBe(true);
    });
  });
});
