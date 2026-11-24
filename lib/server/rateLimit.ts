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
