// Fixed-window in-memory rate limiter.
//
// Scope note: single-process. Adequate for one Railway instance; a
// multi-instance deployment needs a shared store (Redis etc.).
export type RateLimiter = {
  allow(key: string): boolean;
};

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    allow(key: string): boolean {
      const now = Date.now();
      const cutoff = now - windowMs;
      const list = (hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
      if (list.length >= limit) {
        hits.set(key, list);
        return false;
      }
      list.push(now);
      hits.set(key, list);
      return true;
    },
  };
}
