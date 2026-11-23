import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORLDS, playableStages } from "../data/curriculum";
import { PETS } from "../data/pets";
import { WORDS } from "../data/words";
import { PROMPTS, glyphAudio, petAudio, syllableAudio, wordAudio, worldAudio } from "../audio/ids";
import { buildAudioTargets } from "../audio/targets";
import { generateQuestions, seededRng, similarPool } from "../lib/questions";

const ROOT = join(__dirname, "..", "..", "..");
const targets = buildAudioTargets();
const ids = new Set(targets.map((t) => t.id));

describe("음성 파일", () => {
  it("생성 대상 id는 고유하다", () => {
    expect(ids.size).toBe(targets.length);
  });

  it("scripts/gen-audio/targets.json 이 최신이다 (npm run audio:targets)", () => {
    const json = JSON.parse(readFileSync(join(ROOT, "scripts/gen-audio/targets.json"), "utf8"));
    expect(json.voice).toBe("ko-KR-SunHiNeural");
    expect(json.targets).toEqual(targets);
  });

  it("모든 대상의 mp3가 커밋되어 있다 (npm run audio)", () => {
    const missing = targets.filter((t) => {
      const f = join(ROOT, "public/audio/hangul", `${t.id}.mp3`);
      return !existsSync(f) || statSync(f).size < 1000;
    });
    expect(missing.map((t) => t.id)).toEqual([]);
  });

  it("플레이 가능한 스테이지에서 들려주는 소리가 모두 있다", () => {
    const needed = new Set<string>([
      ...Object.keys(PROMPTS),
      ...WORLDS.map((w) => worldAudio(w.id)),
      ...PETS.map((p) => petAudio(p.id)),
      ...WORDS.map((w) => wordAudio(w.id)),
    ]);
    for (const s of playableStages()) {
      s.focus.forEach((c) => glyphAudio(c).forEach((id) => needed.add(id)));
      for (let seed = 1; seed <= 30; seed++) {
        for (const q of generateQuestions(s, { rng: seededRng(seed) })) {
          if (q.kind === "balloon") {
            q.choices.forEach((c) => glyphAudio(c).forEach((id) => needed.add(id)));
          } else if (q.kind === "block") {
            needed.add(syllableAudio(q.result));
            q.choices.forEach((c) => glyphAudio(c).forEach((id) => needed.add(id)));
          } else {
            q.pairs.forEach((p) => glyphAudio(p.answer).forEach((id) => needed.add(id)));
          }
        }
      }
    }
    // 복습 문제 보기
    for (const item of ["ㅏ", "ㄱ", "가", "소"]) {
      similarPool(item).forEach((c) => glyphAudio(c).forEach((id) => needed.add(id)));
    }
    expect([...needed].filter((id) => !ids.has(id))).toEqual([]);
  });

  it("자음은 이름과 소리 두 가지를 들려준다", () => {
    expect(glyphAudio("ㄱ")).toEqual(["c_g_name", "c_g_sound"]);
    expect(glyphAudio("ㅏ")).toEqual(["v_a"]);
    expect(glyphAudio("가")).toEqual(["syl_ac00"]);
  });
});
