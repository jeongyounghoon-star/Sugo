"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ProfilePicker } from "@/components/ProfilePicker";
import { useActiveProfileId } from "@/lib/profiles/client";
import { addPlayTime, shouldShowDailyDone, touchSession } from "../lib/progress";
import { activateProfile, syncNow, updateProgress, useProgress } from "../lib/store";
import { DailyDoneOverlay } from "./DailyDoneOverlay";
import { Loading } from "./ui";

const TICK_SECONDS = 15;
const SYNC_EVERY_MS = 60_000;

/**
 * 한글 모험 공통 껍데기:
 * - 아이를 아직 안 골랐으면 프로필 고르기 화면
 * - 들어올 때 세션 갱신 (복습 출제 기준), 화면이 보이는 동안 하루 사용 시간 기록
 * - 서버 동기화: 들어올 때, 1분마다, 다시 온라인이 될 때
 * - 10분이 지나면 지도/월드 화면에서 "오늘 끝!" 안내 (놀이 중에는 끝난 뒤 PlayStage가 안내)
 */
export function HangulShell({ children }: { children: ReactNode }) {
  const profileId = useActiveProfileId();
  const progress = useProgress();
  const pathname = usePathname();
  const inPlay = pathname.startsWith("/hangul/play");

  useEffect(() => {
    if (!profileId) return;
    const now = Date.now();
    updateProgress((p) => addPlayTime(touchSession(p, now), 0, now));
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      updateProgress((p) => addPlayTime(touchSession(p, t), TICK_SECONDS, t));
    }, TICK_SECONDS * 1000);
    const sync = window.setInterval(() => void syncNow(), SYNC_EVERY_MS);
    const online = () => void syncNow();
    window.addEventListener("online", online);
    void syncNow();
    return () => {
      window.clearInterval(tick);
      window.clearInterval(sync);
      window.removeEventListener("online", online);
    };
  }, [profileId]);

  if (profileId === undefined) return <Loading />;
  if (profileId === null) return <ProfilePicker onPick={(id) => activateProfile(id)} />;

  return (
    <>
      {children}
      {progress && !inPlay && shouldShowDailyDone(progress) && <DailyDoneOverlay />}
    </>
  );
}
