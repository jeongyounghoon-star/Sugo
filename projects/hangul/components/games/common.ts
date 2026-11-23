"use client";

import { useEffect, useRef } from "react";

export interface AnswerResult {
  /** 복습 추적용 글자 */
  item: string;
  /** 첫 시도에 맞혔는지 (틀려도 감점 없이 다시 시도할 수 있지만, 정답률은 첫 시도로 계산) */
  correct: boolean;
}

export interface GameProps<Q> {
  question: Q;
  /** 스테이지의 첫 문제면 게임 설명 음성을 먼저 들려준다 */
  showHowTo: boolean;
  onDone: (results: AnswerResult[]) => void;
}

/** 화면이 사라진 뒤 콜백이 불리지 않도록 */
export function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const BRIGHT_COLORS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#b197fc", "#ffa94d"];
