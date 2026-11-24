import { describe, expect, it } from "vitest";
import { TOTAL_WEEKS, WORLDS, allStages, nextStage, playableStages } from "../data/curriculum";
import { CONSONANTS, VOWELS } from "../data/jamo";
import { PETS } from "../data/pets";
import { WORDS, matchKeyOf } from "../data/words";
import { composeSyllable, decomposeSyllable } from "../lib/hangul";
import { generateQuestions, matchWords, seededRng, unitsOf } from "../lib/questions";

describe("커리큘럼 데이터", () => {
  it("월드 8개가 1~26주를 빈틈없이 나눈다", () => {
    expect(WORLDS).toHaveLength(8);
    let week = 1;
    for (const w of WORLDS) {
      expect(w.weeks[0]).toBe(week);
      expect(w.weeks[1]).toBeGreaterThanOrEqual(w.weeks[0]);
      week = w.weeks[1] + 1;
    }
    expect(week - 1).toBe(TOTAL_WEEKS);
  });

  it("월드 이름과 순서가 기획과 같다", () => {
    expect(WORLDS.map((w) => w.name)).toEqual([
      "모음 숲",
      "자음 마을 1",
      "자음 마을 2",
      "글자 공장",
      "낱말 바다",
      "받침 산",
      "반짝 섬",
      "이야기 성",
    ]);
  });

  it("월드 1은 모음 10개, 월드 2는 자음 8개, 월드 3은 자음 6개", () => {
    expect(WORLDS[0].letters).toEqual(["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ", "ㅑ", "ㅕ", "ㅛ", "ㅠ"]);
    expect(WORLDS[1].letters).toEqual(["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ"]);
    expect(WORLDS[2].letters).toEqual(["ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]);
  });

  it("MVP에서는 월드 1~2만 플레이 가능", () => {
    expect(WORLDS.filter((w) => w.playable).map((w) => w.id)).toEqual([1, 2]);
  });

  it("월드마다 스테이지 5~8개, id는 모두 고유", () => {
    for (const w of WORLDS) {
      expect(w.stages.length).toBeGreaterThanOrEqual(5);
      expect(w.stages.length).toBeLessThanOrEqual(8);
      w.stages.forEach((s, i) => {
        expect(s.worldId).toBe(w.id);
        expect(s.order).toBe(i + 1);
      });
    }
    const ids = allStages().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("월드 1~2 스테이지에서 쓰는 글자는 그 월드까지 배운 글자뿐", () => {
    const known = new Set<string>();
    for (const w of WORLDS.filter((x) => x.playable)) {
      w.letters.forEach((l) => known.add(l));
      for (const s of w.stages) {
        for (const ch of [...s.focus, ...(s.distractors ?? [])]) {
          expect(known.has(ch), `${s.id}: ${ch}`).toBe(true);
        }
      }
    }
  });

  it("블록/짝 맞추기 스테이지는 재료가 충분하다", () => {
    for (const s of playableStages()) {
      if (s.plan.includes("block")) expect(s.blocks, s.id).toBeDefined();
      if (s.plan.includes("match")) {
        const answers = new Set(matchWords(s).map((w) => matchKeyOf(w, s.matchBy ?? "vowel")));
        expect(answers.size, s.id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("월드 2 블록은 월드 1 모음과 조합한다", () => {
    const vowels = new Set(VOWELS.map((v) => v.char));
    for (const s of WORLDS[1].stages) {
      for (const v of s.blocks?.vowels ?? []) expect(vowels.has(v)).toBe(true);
    }
  });

  it("다음 스테이지는 월드를 넘어 이어진다", () => {
    expect(nextStage("w1-s1")?.id).toBe("w1-s2");
    expect(nextStage("w1-s7")?.id).toBe("w2-s1");
    expect(nextStage("w8-s5")).toBeUndefined();
  });

  it("월드마다 펫이 하나씩 있다", () => {
    for (const w of WORLDS) {
      expect(PETS.find((p) => p.id === w.petId)?.worldId).toBe(w.id);
    }
  });

  it("자음은 이름과 아이용 소리를 모두 갖는다", () => {
    expect(CONSONANTS).toHaveLength(14);
    const g = CONSONANTS.find((c) => c.char === "ㄱ")!;
    expect(g.name).toBe("기역");
    expect(g.sound).toBe("그");
    for (const c of CONSONANTS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.sound).toBe(composeSyllable(c.char, "ㅡ"));
    }
  });

  it("낱말 그림 데이터에 받침 없는 첫 글자가 있다", () => {
    for (const w of WORDS) expect(decomposeSyllable(w.word[0])).not.toBeNull();
  });
});

describe("한글 조립", () => {
  it("ㄱ + ㅏ = 가, ㅇ + ㅣ = 이, ㅅ + ㅠ = 슈", () => {
    expect(composeSyllable("ㄱ", "ㅏ")).toBe("가");
    expect(composeSyllable("ㅇ", "ㅣ")).toBe("이");
    expect(composeSyllable("ㅅ", "ㅠ")).toBe("슈");
  });

  it("분해는 조립의 역", () => {
    expect(decomposeSyllable("모")).toEqual({ initial: "ㅁ", medial: "ㅗ", hasFinal: false });
    expect(decomposeSyllable("말")?.hasFinal).toBe(true);
    expect(decomposeSyllable("ㄱ")).toBeNull();
  });
});

describe("문제 생성", () => {
  it("모든 플레이 가능 스테이지에서 계획대로 문제를 만든다", () => {
    for (const s of playableStages()) {
      for (let seed = 1; seed <= 20; seed++) {
        const qs = generateQuestions(s, { rng: seededRng(seed) });
        expect(qs.map((q) => q.kind)).toEqual(s.plan);
        for (const q of qs) {
          if (q.kind === "balloon") {
            expect(q.choices).toContain(q.target);
            expect(new Set(q.choices).size).toBe(q.choices.length);
            expect(q.choices.length).toBeGreaterThanOrEqual(2);
          } else if (q.kind === "block") {
            expect(composeSyllable(q.consonant, q.vowel)).toBe(q.result);
            expect(q.choices).toContain(q.missing === "vowel" ? q.vowel : q.consonant);
            expect(new Set(q.choices).size).toBe(q.choices.length);
          } else {
            expect(q.pairs).toHaveLength(3);
            expect(new Set(q.pairs.map((p) => p.answer)).size).toBe(3);
            for (const p of q.pairs) expect(s.focus).toContain(p.answer);
          }
        }
      }
    }
  });

  it("같은 시드면 같은 문제", () => {
    const s = playableStages()[0];
    expect(generateQuestions(s, { rng: seededRng(7) })).toEqual(
      generateQuestions(s, { rng: seededRng(7) }),
    );
  });

  it("복습 글자는 앞쪽에 복습 문제로 들어간다", () => {
    const s = playableStages()[3];
    const qs = generateQuestions(s, { rng: seededRng(3), reviewItems: ["ㅓ", "가"] });
    expect(qs).toHaveLength(s.plan.length + 2);
    expect(qs[0]).toMatchObject({ kind: "balloon", target: "ㅓ", review: true });
    expect(qs[1]).toMatchObject({ kind: "balloon", target: "가", review: true });
  });

  it("짝 맞추기는 짝 하나가 1점", () => {
    const s = WORLDS[0].stages[3];
    const qs = generateQuestions(s, { rng: seededRng(1) });
    expect(qs.reduce((n, q) => n + unitsOf(q), 0)).toBe(3 + 1 + 3 + 1);
  });
});
