import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import manifest from "./manifest";

describe("사이트 입구 (한글 모험 전용)", () => {
  it("루트(/)는 바로 /hangul 로 임시 이동한다", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toContainEqual({ source: "/", destination: "/hangul", permanent: false });
  });

  it("허브 홈 페이지(app/page.tsx)가 없다 — 있으면 위 이동이 무시된다", () => {
    expect(existsSync(join(__dirname, "page.tsx"))).toBe(false);
  });

  it("홈 화면 설치 정보는 한글 모험이고 /hangul 로 시작한다", () => {
    const m = manifest();
    expect(m.name).toBe("한글 모험");
    expect(m.start_url).toBe("/hangul");
    expect(m.shortcuts?.[0]?.url).toBe("/hangul");
  });

  it("서비스 워커는 이동하는 루트(/)를 미리 저장하지 않는다", () => {
    const sw = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8");
    expect(sw).not.toMatch(/PRECACHE = \["\/"/);
    expect(sw).toContain('caches.match("/hangul")');
  });
});
