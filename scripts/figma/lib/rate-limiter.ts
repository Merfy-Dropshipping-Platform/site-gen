/**
 * Simple token-bucket rate limiter.
 * Figma REST API is ~1000 req/hour + short bursts; we play nice at 3 req/sec sustained.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly ratePerSec: number = 3,
    private readonly burst: number = 5,
  ) {
    this.tokens = burst;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait for next token
    const waitMs = Math.ceil(1000 / this.ratePerSec);
    await sleep(waitMs);
    return this.acquire();
  }

  private refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    const refillTokens = elapsedSec * this.ratePerSec;
    if (refillTokens >= 1) {
      this.tokens = Math.min(this.burst, this.tokens + Math.floor(refillTokens));
      this.lastRefill = now;
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export function exponentialBackoff(attempt: number, baseMs = 500, capMs = 30_000): number {
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt));
  const jitter = Math.random() * exp * 0.25;
  return Math.floor(exp + jitter);
}
