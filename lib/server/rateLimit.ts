/**
 * 아주 단순한 토큰 버킷 (서버 한 대, 메모리). 집 LAN 전용이라 기기 구분 없이 종류별로 묶는다.
 * (클라이언트 IP 헤더는 위조할 수 있어서 키로 쓰지 않음)
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private opts: { capacity: number; refillPerSecond: number },
    private now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.opts.capacity, at: t };
    b.tokens = Math.min(this.opts.capacity, b.tokens + ((t - b.at) / 1000) * this.opts.refillPerSecond);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }

  reset() {
    this.buckets.clear();
  }
}

/** 부모 PIN 실패가 많으면 잠시 잠근다 (전체 기준) */
export class FailureLock {
  private failures: number[] = [];
  private lockedUntil = 0;

  constructor(
    private opts: { maxFailures: number; windowMs: number; lockMs: number },
    private now: () => number = Date.now,
  ) {}

  isLocked(): boolean {
    return this.now() < this.lockedUntil;
  }

  fail(): void {
    const t = this.now();
    this.failures = this.failures.filter((f) => t - f < this.opts.windowMs);
    this.failures.push(t);
    if (this.failures.length >= this.opts.maxFailures) {
      this.lockedUntil = t + this.opts.lockMs;
      this.failures = [];
    }
  }

  succeed(): void {
    this.failures = [];
  }

  reset(): void {
    this.failures = [];
    this.lockedUntil = 0;
  }
}
