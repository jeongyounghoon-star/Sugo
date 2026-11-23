"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CORRECT_PROMPTS, WRONG_PROMPTS, glyphAudio, wordAudio } from "../../audio/ids";
import { pickRandom, playSequence, stopAudio } from "../../audio/player";
import { seededRng, shuffle, type MatchQuestion } from "../../lib/questions";
import { SpeakerButton } from "../ui";
import { BRIGHT_COLORS, useAlive, wait, type GameProps } from "./common";

/** (c) 그림-글자 짝 맞추기: 그림을 누르고 맞는 글자를 누른다 (순서는 반대여도 OK) */
export function MatchGame({ question, showHowTo, onDone }: GameProps<MatchQuestion>) {
  const [pic, setPic] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [wrong, setWrong] = useState<{ char: string; n: number } | null>(null);
  const missed = useRef(new Set<string>());
  const alive = useAlive();

  // 글자 칸 순서는 그림과 다르게 섞는다 (문제마다 고정)
  const letters = useMemo(() => {
    const seed = question.pairs.reduce((n, p) => n + p.word.charCodeAt(0), 0);
    const order = shuffle(question.pairs.map((p) => p.answer), seededRng(seed));
    const same = order.every((a, i) => a === question.pairs[i].answer);
    return same ? [...order.slice(1), order[0]] : order;
  }, [question]);

  useEffect(() => {
    if (showHowTo) playSequence(["p_match"]);
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryPair = async (wordId: string, char: string) => {
    const pair = question.pairs.find((p) => p.wordId === wordId)!;
    if (pair.answer === char) {
      const next = [...matched, wordId];
      setMatched(next);
      setPic(null);
      setLetter(null);
      if (next.length === question.pairs.length) {
        await Promise.all([playSequence([...glyphAudio(char).slice(-1), pickRandom(CORRECT_PROMPTS)]), wait(800)]);
        if (alive.current) {
          onDone(question.pairs.map((p) => ({ item: p.answer, correct: !missed.current.has(p.wordId) })));
        }
      } else {
        playSequence([...glyphAudio(char).slice(-1), pickRandom(CORRECT_PROMPTS)]);
      }
    } else {
      missed.current.add(wordId);
      setWrong((w) => ({ char, n: (w?.n ?? 0) + 1 }));
      setLetter(null);
      playSequence([pickRandom(WRONG_PROMPTS), wordAudio(pair.wordId)]);
    }
  };

  const onPic = (wordId: string) => {
    if (matched.includes(wordId)) return;
    setPic(wordId);
    if (letter) tryPair(wordId, letter);
    else playSequence([wordAudio(wordId)]);
  };

  const onLetter = (char: string) => {
    if (question.pairs.some((p) => p.answer === char && matched.includes(p.wordId))) return;
    setLetter(char);
    if (pic) tryPair(pic, char);
    else playSequence(glyphAudio(char));
  };

  const colorOf = (wordId: string) =>
    BRIGHT_COLORS[question.pairs.findIndex((p) => p.wordId === wordId) % BRIGHT_COLORS.length];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <SpeakerButton audio={["p_match"]} label="설명 다시 듣기" />
      <div className="grid w-full max-w-2xl grid-cols-2 gap-x-10 gap-y-4 sm:gap-x-24">
        <ul className="flex flex-col gap-4">
          {question.pairs.map((p) => {
            const done = matched.includes(p.wordId);
            return (
              <li key={p.wordId}>
                <button
                  type="button"
                  aria-label={`그림 ${p.word}`}
                  onClick={() => onPic(p.wordId)}
                  className={`flex h-28 w-full items-center justify-center rounded-3xl border-b-8 bg-white text-7xl shadow-lg transition active:translate-y-1 sm:h-32 ${
                    pic === p.wordId ? "ring-8 ring-sky-300" : ""
                  } ${done ? "border-transparent" : "border-black/10"}`}
                  style={done ? { backgroundColor: colorOf(p.wordId) } : undefined}
                >
                  {p.emoji}
                  {done && <span className="ml-2 text-4xl">✔️</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="flex flex-col gap-4">
          {letters.map((char) => {
            const pair = question.pairs.find((p) => p.answer === char)!;
            const done = matched.includes(pair.wordId);
            const isWrong = wrong?.char === char;
            return (
              <li key={`${char}-${isWrong ? wrong?.n : 0}`}>
                <button
                  type="button"
                  aria-label={`글자 ${char}`}
                  onClick={() => onLetter(char)}
                  className={`flex h-28 w-full items-center justify-center rounded-3xl border-b-8 text-7xl shadow-lg transition active:translate-y-1 sm:h-32 sm:text-8xl ${
                    letter === char ? "ring-8 ring-sky-300" : ""
                  } ${isWrong ? "animate-wiggle" : ""} ${done ? "border-transparent text-white" : "border-black/10 bg-white text-slate-700"}`}
                  style={done ? { backgroundColor: colorOf(pair.wordId) } : undefined}
                >
                  {char}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
