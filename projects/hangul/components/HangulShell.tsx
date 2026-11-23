"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { addPlayTime, shouldShowDailyDone, touchSession } from "../lib/progress";
import { updateProgress, useProgress } from "../lib/store";
import { DailyDoneOverlay } from "./DailyDoneOverlay";

const TICK_SECONDS = 15;

/**
 * 한글 모험 공통 껍데기:
 * - 들어올 때 세션 갱신 (복습 출제 기준)
 * - 화면이 보이는 동안 하루 사용 시간 기록
 * - 10분이 지나면 지도/월드 화면에서 "오늘 끝!" 안내 (놀이 중에는 끝난 뒤 PlayStage가 안내)
 */
export function HangulShell({ children }: { children: ReactNode }) {
  const progress = useProgress();
  const pathname = usePathname();
  const inPlay = pathname.startsWith("/hangul/play");

  useEffect(() => {
    const now = Date.now();
    updateProgress((p) => addPlayTime(touchSession(p, now), 0, now));
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      updateProgress((p) => addPlayTime(touchSession(p, t), TICK_SECONDS, t));
    }, TICK_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      {children}
      {progress && !inPlay && shouldShowDailyDone(progress) && <DailyDoneOverlay />}
    </>
  );
}
