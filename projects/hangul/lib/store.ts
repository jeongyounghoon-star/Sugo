"use client";

import { useSyncExternalStore } from "react";
import { getActiveProfileId, setActiveProfileId, useActiveProfileId } from "@/lib/profiles/client";
import type { Progress } from "./progress";
import { appendOutbox, uuidV4, type PlayEvent } from "./sync";
import { clearLocal, loadLocal, localKey, migrateLegacy, saveLocal, syncOnce } from "./syncClient";

/**
 * 지금 고른 아이의 진도 (브라우저 캐시 우선, 서버와 백그라운드 동기화).
 */

let memory: { profileId: string; progress: Progress } | null = null;
const listeners = new Set<() => void>();
export type SyncStatus = "idle" | "syncing" | "offline";
let status: SyncStatus = "idle";

function emit() {
  for (const l of listeners) l();
}

function read(): Progress | null {
  const id = getActiveProfileId();
  if (!id) return null;
  if (!memory || memory.profileId !== id) {
    memory = { profileId: id, progress: loadLocal(window.localStorage, id).progress };
  }
  return memory.progress;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith("sugo.")) {
      memory = null; // 다른 탭에서 바뀜
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 서버 렌더/하이드레이션 중이거나 아이를 안 골랐으면 null */
export function useProgress(): Progress | null {
  useActiveProfileId(); // 아이가 바뀌면 다시 그리기
  return useSyncExternalStore(subscribe, read, () => null);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => status, () => "idle");
}

export function getProgress(): Progress {
  const p = read();
  if (!p) throw new Error("no active profile");
  return p;
}

export function updateProgress(fn: (p: Progress) => Progress): Progress | null {
  const id = getActiveProfileId();
  if (!id) return null;
  const state = loadLocal(window.localStorage, id);
  const next = fn(read() ?? state.progress);
  saveLocal(window.localStorage, id, { ...state, progress: next });
  memory = { profileId: id, progress: next };
  emit();
  scheduleSync(2000);
  return next;
}

/** 스테이지 한 판 기록 → 보낼 목록(outbox)에 쌓기 */
export function recordPlay(e: Omit<PlayEvent, "id" | "playedAt">): void {
  const id = getActiveProfileId();
  if (!id) return;
  const state = loadLocal(window.localStorage, id);
  const event: PlayEvent = { ...e, id: uuidV4((a) => crypto.getRandomValues(a)), playedAt: Date.now() };
  saveLocal(window.localStorage, id, { ...state, outbox: appendOutbox(state.outbox, event) });
  scheduleSync(1000);
}

/** 아이 고르기 (처음이면 예전 진도를 옮긴다) */
export function activateProfile(id: string | null): void {
  if (id) migrateLegacy(window.localStorage, id);
  memory = null;
  setActiveProfileId(id);
  emit();
  if (id) void syncNow();
}

let timer: number | null = null;
let running = false;

export function scheduleSync(delayMs: number) {
  if (typeof window === "undefined") return;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void syncNow();
  }, delayMs);
}

export async function syncNow(): Promise<void> {
  const id = getActiveProfileId();
  if (!id || running) return;
  running = true;
  status = "syncing";
  emit();
  try {
    const result = await syncOnce(window.localStorage, (u, i) => fetch(u, i), id);
    if (result === "gone") {
      // 부모가 이 프로필을 지움
      clearLocal(window.localStorage, id);
      activateProfile(null);
    }
    status = result === "offline" ? "offline" : "idle";
    if (memory?.profileId === id) memory = null;
  } finally {
    running = false;
    emit();
  }
}

export { localKey };
