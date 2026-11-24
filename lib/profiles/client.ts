"use client";

import { useSyncExternalStore } from "react";
import type { Profile } from "./shared";

/**
 * 브라우저 쪽 프로필 상태 (허브 공용).
 * - 지금 고른 아이: localStorage "sugo.activeProfile"
 * - 프로필 목록은 서버에서 받아 캐시 → 서버가 잠깐 꺼져도 고를 수 있다
 */

const ACTIVE_KEY = "sugo.activeProfile";
const CACHE_KEY = "sugo.profiles.cache";
const listeners = new Set<() => void>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // 무시
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_KEY || e.key === CACHE_KEY) l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

function emit() {
  for (const l of listeners) l();
}

export function getActiveProfileId(): string | null {
  return safeGet(ACTIVE_KEY);
}

export function setActiveProfileId(id: string | null) {
  safeSet(ACTIVE_KEY, id);
  emit();
}

/** undefined: 서버 렌더/하이드레이션 중, null: 아직 안 고름 */
export function useActiveProfileId(): string | null | undefined {
  return useSyncExternalStore(subscribe, getActiveProfileId, () => undefined);
}

let cachedRaw: string | null = null;
let cachedList: Profile[] = [];

export function getCachedProfiles(): Profile[] {
  const raw = safeGet(CACHE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedList = raw ? (JSON.parse(raw) as Profile[]) : [];
    } catch {
      cachedList = [];
    }
  }
  return cachedList;
}

const EMPTY: Profile[] = [];

export function useCachedProfiles(): Profile[] {
  return useSyncExternalStore(subscribe, getCachedProfiles, () => EMPTY);
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

async function api<T>(path: string, init?: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiRequestError(res.status, data.error ?? "error");
  return data;
}

/** 서버에서 목록을 새로 받아 캐시. 실패하면 캐시를 돌려주고 offline=true */
export async function refreshProfiles(): Promise<{ profiles: Profile[]; offline: boolean }> {
  try {
    const { profiles } = await api<{ profiles: Profile[] }>("/api/profiles");
    safeSet(CACHE_KEY, JSON.stringify(profiles));
    emit();
    // 고른 아이가 다른 기기에서 지워졌으면 선택 해제
    const active = getActiveProfileId();
    if (active && !profiles.some((p) => p.id === active)) setActiveProfileId(null);
    return { profiles, offline: false };
  } catch {
    return { profiles: getCachedProfiles(), offline: true };
  }
}

export async function createProfile(nickname: string, avatar: string): Promise<Profile> {
  const { profile } = await api<{ profile: Profile }>("/api/profiles", {
    method: "POST",
    body: { nickname, avatar },
  });
  await refreshProfiles();
  return profile;
}

// ---------- 부모용 (PIN 필요) ----------

export const parentApi = {
  pinStatus: () => api<{ isSet: boolean; setupCodeRequired: boolean }>("/api/parent/pin"),
  /** 처음 만들 때는 setupCode(설치 코드), 바꿀 때는 currentPin */
  setPin: (newPin: string, opts: { currentPin?: string; setupCode?: string } = {}) =>
    api<{ ok: true }>("/api/parent/pin", { method: "POST", body: { newPin, ...opts } }),
  verify: (pin: string) => api<{ ok: true }>("/api/parent/verify", { method: "POST", body: { pin } }),
  rename: (id: string, nickname: string, pin: string) =>
    api<{ profile: Profile }>(`/api/profiles/${encodeURIComponent(id)}`, { method: "PATCH", body: { nickname, pin } }),
  remove: (id: string, pin: string) =>
    api<{ ok: true }>(`/api/profiles/${encodeURIComponent(id)}`, { method: "DELETE", body: { pin } }),
  reset: (id: string, pin: string) =>
    api<{ ok: true }>(`/api/profiles/${encodeURIComponent(id)}/reset`, { method: "POST", body: { pin } }),
};
