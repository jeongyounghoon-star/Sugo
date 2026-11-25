"use client";

import { useEffect } from "react";
import { IconLink } from "@/components/IconButton";
import { playSequence, stopAudio } from "../audio/player";
import { PETS } from "../data/pets";
import { dismissDaily } from "../lib/progress";
import { updateProgress } from "../lib/store";
import { Pet } from "./Pet";

/** 하루 약 10분이 지나면 부드럽게 "오늘 끝!" 안내 */
export function DailyDoneOverlay() {
  useEffect(() => {
    playSequence(["p_daily_done"]);
    return () => stopAudio();
  }, []);

  return (
    <div
      role="dialog"
      aria-label="오늘은 여기까지"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-indigo-950/85 p-6 text-white backdrop-blur-sm"
    >
      <div className="flex items-end gap-2" aria-hidden>
        <span className="text-7xl">🌙</span>
        <span className="text-4xl">✨</span>
      </div>
      <div className="animate-bounce-in rounded-full bg-indigo-200/20 p-4">
        <Pet pet={PETS[0]} stage={3} size={180} />
      </div>
      <p className="text-5xl" aria-hidden>
        💤
      </p>
      <IconLink href="/hangul" label="오늘은 끝! 처음 화면으로" size="xl" color="#ffcf5c">
        🏠
      </IconLink>
      <button
        type="button"
        onClick={() => {
          stopAudio();
          updateProgress((p) => dismissDaily(p, Date.now()));
        }}
        className="mt-4 rounded-full border border-white/40 px-5 py-3 font-sans text-sm text-white/80"
      >
        어른용: 오늘 조금 더 하기
      </button>
    </div>
  );
}
