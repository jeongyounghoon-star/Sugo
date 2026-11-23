"use client";

import { useSyncExternalStore } from "react";
import type { Progress } from "./progress";
import { STORAGE_KEY, loadProgress, saveProgress } from "./storage";

let memory: Progress | null = null;
const listeners = new Set<() => void>();

function read(): Progress {
  if (memory === null) memory = loadProgress(window.localStorage);
  return memory;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      memory = null; // 다른 탭에서 바뀜 → 다시 읽기
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 서버 렌더/하이드레이션 중에는 null, 그 다음부터 진도 */
export function useProgress(): Progress | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function getProgress(): Progress {
  return read();
}

export function updateProgress(fn: (p: Progress) => Progress): Progress {
  const next = fn(read());
  memory = next;
  saveProgress(window.localStorage, next);
  emit();
  return next;
}
