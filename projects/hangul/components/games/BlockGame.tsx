"use client";

import { useEffect, useRef, useState } from "react";
import { CORRECT_PROMPTS, WRONG_PROMPTS, glyphAudio, syllableAudio } from "../../audio/ids";
import { pickRandom, playSequence, stopAudio } from "../../audio/player";
import type { BlockQuestion } from "../../lib/questions";
import { SpeakerButton } from "../ui";
import { useAlive, wait, type GameProps } from "./common";

const CONSONANT_COLOR = "#4dabf7";
const VOWEL_COLOR = "#ff6b6b";
const RESULT_COLOR = "#ffd43b";

function Block({
  char,
  color,
  dashed,
  className = "",
  big,
}: {
  char: string;
  color: string;
  dashed?: boolean;
  className?: string;
  big?: boolean;
}) {
  return (
    <span
      className={`flex items-center justify-center rounded-3xl ${
        big ? "h-32 w-32 text-8xl sm:h-40 sm:w-40 sm:text-9xl" : "h-24 w-24 text-6xl sm:h-28 sm:w-28 sm:text-7xl"
      } ${dashed ? "border-4 border-dashed border-slate-400 bg-white/60 text-slate-400" : "border-b-8 border-black/20 text-white shadow-lg"} ${className}`}
      style={dashed ? undefined : { backgroundColor: color }}
    >
      {char}
    </span>
  );
}

/** (b) 글자 블록 조립: ㄱ + ㅏ → 가 */
export function BlockGame({ question, showHowTo, onDone }: GameProps<BlockQuestion>) {
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState<{ char: string; n: number } | null>(null);
  const missed = useRef(false);
  const alive = useAlive();
  const resultAudio = [syllableAudio(question.result)];
  const answer = question.missing === "vowel" ? question.vowel : question.consonant;

  useEffect(() => {
    playSequence([...(showHowTo ? ["p_block"] : []), ...resultAudio]);
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTap = async (choice: string) => {
    if (solved) return;
    if (choice === answer) {
      setSolved(true);
      await Promise.all([
        playSequence([...glyphAudio(choice).slice(-1), ...resultAudio, pickRandom(CORRECT_PROMPTS)]),
        wait(900),
      ]);
      if (alive.current) onDone([{ item: answer, correct: !missed.current }]);
    } else {
      missed.current = true;
      setWrong((w) => ({ char: choice, n: (w?.n ?? 0) + 1 }));
      playSequence([pickRandom(WRONG_PROMPTS), ...resultAudio]);
    }
  };

  const showConsonant = question.missing !== "consonant" || solved;
  const showVowel = question.missing !== "vowel" || solved;
  const choiceColor = question.missing === "vowel" ? VOWEL_COLOR : CONSONANT_COLOR;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <SpeakerButton size="xl" audio={resultAudio} label="소리 다시 듣기" />
      <div className="flex flex-wrap items-center justify-center gap-3 text-5xl text-slate-500 sm:gap-5">
        <Block
          char={showConsonant ? question.consonant : "?"}
          color={CONSONANT_COLOR}
          dashed={!showConsonant}
          className={solved && question.missing === "consonant" ? "animate-bounce-in" : ""}
        />
        <span aria-hidden>+</span>
        <Block
          char={showVowel ? question.vowel : "?"}
          color={VOWEL_COLOR}
          dashed={!showVowel}
          className={solved && question.missing === "vowel" ? "animate-bounce-in" : ""}
        />
        <span aria-hidden>=</span>
        <Block
          big
          char={solved ? question.result : "?"}
          color={RESULT_COLOR}
          dashed={!solved}
          className={solved ? "animate-bounce-in text-amber-800!" : ""}
        />
      </div>
      <div className="flex flex-wrap justify-center gap-5">
        {question.choices.map((choice) => {
          const isWrong = wrong?.char === choice;
          const used = solved && choice === answer;
          return (
            <button
              key={`${choice}-${isWrong ? wrong?.n : 0}`}
              type="button"
              aria-label={`블록 ${choice}`}
              onClick={() => onTap(choice)}
              disabled={solved}
              className={`transition active:scale-95 ${isWrong ? "animate-wiggle" : ""} ${used ? "opacity-30" : ""} ${solved && !used ? "opacity-50" : ""}`}
            >
              <Block char={choice} color={choiceColor} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
