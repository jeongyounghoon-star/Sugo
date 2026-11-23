"use client";

import { audioUrl } from "./ids";

/**
 * 미리 만든 mp3를 순서대로 재생한다. 새로 재생하면 이전 재생은 멈춘다.
 * playSequence가 돌려주는 Promise는 끝까지 재생했으면 true, 중간에 끊겼으면 false.
 * 파일이 없거나 자동재생이 막혀도 게임이 멈추지 않도록 항상 resolve.
 */

const cache = new Map<string, HTMLAudioElement>();
let token = 0;
let current: HTMLAudioElement | null = null;
let finishCurrent: (() => void) | null = null;

function element(id: string): HTMLAudioElement {
  let el = cache.get(id);
  if (!el) {
    el = new Audio(audioUrl(id));
    el.preload = "auto";
    cache.set(id, el);
  }
  return el;
}

export function preload(ids: string[]): void {
  if (typeof window === "undefined") return;
  ids.forEach((id) => element(id));
}

function playOne(id: string, myToken: number): Promise<void> {
  return new Promise((resolve) => {
    if (myToken !== token) return resolve();
    const el = element(id);
    current = el;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("ended", finish);
      el.removeEventListener("error", finish);
      clearTimeout(timer);
      if (finishCurrent === finish) finishCurrent = null;
      resolve();
    };
    // 이벤트가 안 오는 브라우저를 위한 안전장치
    const timer = setTimeout(finish, 8000);
    finishCurrent = finish;
    el.addEventListener("ended", finish);
    el.addEventListener("error", finish);
    try {
      el.currentTime = 0;
      const p = el.play();
      if (p) p.catch(finish);
    } catch {
      finish();
    }
  });
}

export async function playSequence(ids: string[], gapMs = 150): Promise<boolean> {
  if (typeof window === "undefined") return false;
  stopAudio();
  const myToken = token;
  for (let i = 0; i < ids.length; i++) {
    if (myToken !== token) return false;
    await playOne(ids[i], myToken);
    if (gapMs && i < ids.length - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  return myToken === token;
}

export function play(id: string): Promise<boolean> {
  return playSequence([id]);
}

export function stopAudio(): void {
  token++;
  if (current) {
    current.pause();
    current = null;
  }
  finishCurrent?.();
}

export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
