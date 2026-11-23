import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { RateLimiter } from "./rateLimit";

/**
 * API 공통 처리:
 * - 집 LAN 전용이므로 Host가 IP/localhost/.local/ALLOWED_HOSTS일 때만 응답 (DNS 리바인딩 방어)
 * - 다른 사이트에서 온 요청(Origin 불일치)과 JSON이 아닌 쓰기 요청 거부 (CSRF 방어)
 * - 요청 크기 제한, 간단한 rate limit
 * - 에러 응답에는 내부 정보(스택, SQL)를 넣지 않는다
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export const KB = 1024;

function hostOnly(host: string): string {
  // [::1]:3000 → ::1, 192.168.0.2:3000 → 192.168.0.2
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  const i = host.lastIndexOf(":");
  return i > -1 && host.indexOf(":") === i ? host.slice(0, i) : host;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isAllowedHost(host: string | null, extra = process.env.ALLOWED_HOSTS ?? ""): boolean {
  if (!host) return false;
  const name = hostOnly(host.trim().toLowerCase());
  if (!name) return false;
  if (name === "localhost" || IPV4.test(name) || name.includes(":")) return true; // IPv4 / IPv6 리터럴
  if (name.endsWith(".local")) return true; // mDNS (예: my-pc.local)
  const allowed = extra
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(name);
}

const limiter = new RateLimiter({ capacity: 120, refillPerSecond: 4 });

export function resetRateLimitForTests() {
  limiter.reset();
}

export function guard(req: Request, { write }: { write: boolean }): void {
  const host = req.headers.get("host");
  if (!isAllowedHost(host)) throw new ApiError(403, "forbidden_host");
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      throw new ApiError(403, "forbidden_origin");
    }
    if (originHost !== host!.toLowerCase()) throw new ApiError(403, "forbidden_origin");
  }
  if (write) {
    const type = req.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("application/json")) throw new ApiError(415, "unsupported_media_type");
  }
  if (!limiter.take(write ? "write" : "read")) throw new ApiError(429, "too_many_requests");
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes: number): Promise<z.infer<S>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new ApiError(413, "payload_too_large");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(400, "invalid_input");
  return parsed.data;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** 핸들러를 감싸서 ApiError는 그대로, 나머지는 내부 정보 없이 500으로 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    // Next 내부 신호(동적 렌더 전환 등)는 그대로 넘긴다
    unstable_rethrow(err);
    if (err instanceof ApiError) return json({ error: err.code }, err.status);
    // 로그에는 에러 종류/코드만 (요청 값, 아이 이름, SQL 문은 남기지 않음)
    const e = err as { name?: string; code?: string };
    console.error(`[api] unexpected error name=${e?.name ?? "unknown"} code=${e?.code ?? "-"}`);
    return json({ error: "server_error" }, 500);
  }
}
