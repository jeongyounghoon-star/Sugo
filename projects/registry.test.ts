import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECTS, projectHref } from "./registry";

describe("프로젝트 목록", () => {
  it("slug가 고유하고 URL에 쓸 수 있다", () => {
    const slugs = PROJECTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("공개된 프로젝트는 app/<slug>/page.tsx 와 projects/<slug>/ 폴더가 있다", () => {
    for (const p of PROJECTS.filter((x) => x.status === "live")) {
      expect(existsSync(join(__dirname, "..", "app", p.slug, "page.tsx")), p.slug).toBe(true);
      expect(existsSync(join(__dirname, p.slug)), p.slug).toBe(true);
      expect(projectHref(p)).toBe(`/${p.slug}`);
    }
  });
});
