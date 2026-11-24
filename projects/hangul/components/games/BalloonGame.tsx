"use client";

import { useEffect, useRef, useState } from "react";
import { CORRECT_PROMPTS, WRONG_PROMPTS, glyphAudio } from "../../audio/ids";
import { pickRandom, playSequence, stopAudio } from "../../audio/player";
import type { BalloonQuestion } from "../../lib/questions";
import { SpeakerButton } from "../ui";
import { BRIGHT_COLORS, useAlive, wait, type GameProps } from "./common";

/** (a) 소리 듣고 글자 고르기: 맞는 글자 풍선을 터뜨린다 */
export function BalloonGame({ question, showHowTo, onDone }: GameProps<BalloonQuestion>) {
  const [popped, setPopped] = useState<string | null>(null);
  const [wrong, setWrong] = useState<{ char: string; n: number } | null>(null);
  const missed = useRef(false);
  const alive = useAlive();
  const promptAudio = [
    ...(question.review ? ["p_review"] : []),
    ...(showHowTo ? ["p_balloon"] : []),
    ...glyphAudio(question.target),
  ];
  const target = glyphAudio(question.target);

  useEffect(() => {
    playSequence(promptAudio);
    return () => stopAudio();
    // 문제 하나당 한 번만 재생
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTap = async (choice: string) => {
    if (popped) return;
    if (choice === question.target) {
      setPopped(choice);
      await Promise.all([playSequence([...target, pickRandom(CORRECT_PROMPTS)]), wait(700)]);
      if (alive.current) onDone([{ item: question.target, correct: !missed.current }]);
    } else {
      missed.current = true;
      setWrong((w) => ({ char: choice, n: (w?.n ?? 0) + 1 }));
      playSequence([pickRandom(WRONG_PROMPTS), ...target]);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <SpeakerButton size="xl" audio={target} label="소리 다시 듣기" />
      <div className="flex flex-wrap items-end justify-center gap-6 sm:gap-10">
        {question.choices.map((choice, i) => {
          const color = BRIGHT_COLORS[(i + question.target.charCodeAt(0)) % BRIGHT_COLORS.length];
          const isPopped = popped === choice;
          const isWrong = wrong?.char === choice;
          return (
            <button
              key={`${choice}-${isWrong ? wrong?.n : 0}`}
              type="button"
              onClick={() => onTap(choice)}
              aria-label={`풍선 ${choice}`}
              disabled={!!popped && !isPopped}
              className={`relative h-52 w-36 sm:h-60 sm:w-40 ${isPopped ? "animate-pop" : isWrong ? "animate-wiggle" : "animate-float"}`}
              style={{ animationDelay: isPopped || isWrong ? "0s" : `${i * 0.4}s` }}
            >
              <svg viewBox="0 0 120 170" className="absolute inset-0 h-full w-full" aria-hidden>
                <path d="M60 128 q-6 14 4 22 q-10 8 -2 18" stroke="#94a3b8" strokeWidth="2" fill="none" />
                <ellipse cx="60" cy="62" rx="54" ry="62" fill={color} />
                <path d="M52 122 l8 -6 l8 6z" fill={color} />
                <ellipse cx="38" cy="36" rx="10" ry="16" fill="#fff" opacity="0.45" transform="rotate(-20 38 36)" />
              </svg>
              <span className="absolute inset-x-0 top-[18%] text-center text-7xl text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)] sm:text-8xl">
                {choice}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
