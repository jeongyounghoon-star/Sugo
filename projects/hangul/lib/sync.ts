/**
 * 진도 동기화 (서버 ↔ 브라우저 캐시)의 순수 로직.
 *
 * 브라우저는 항상 자기 캐시에 먼저 저장하고(오프라인/서버 장애 대비), 연결되면 전체 진도를
 * 서버로 보낸다. 서버와 브라우저는 같은 mergeProgress로 합치므로 순서가 바뀌거나
 * 같은 요청이 두 번 와도 결과가 같다 (별은 줄지 않고, 시간 기록은 큰 값이 이긴다).
 */
import { pruneHistory, type Progress, type StageRecord } from "./progress";

function mergeStage(a: StageRecord | undefined, b: StageRecord | undefined): StageRecord {
  if (!a) return b!;
  if (!b) return a;
  return {
    bestStars: Math.max(a.bestStars, b.bestStars),
    bestAccuracy: Math.max(a.bestAccuracy, b.bestAccuracy),
    plays: Math.max(a.plays, b.plays),
  };
}

export function mergeProgress(a: Progress, b: Progress): Progress {
  const stageIds = new Set([...Object.keys(a.stages), ...Object.keys(b.stages)]);
  const stages = Object.fromEntries(
    [...stageIds].sort().map((id) => [id, mergeStage(a.stages[id], b.stages[id])]),
  );

  const aActive = a.session.lastActive ?? 0;
  const bActive = b.session.lastActive ?? 0;
  // 복습 큐는 더 최근에 활동한 쪽을 따른다 (같으면 a)
  const review = bActive > aActive ? b.review : a.review;
  const lastActive = Math.max(aActive, bActive);

  let daily: Progress["daily"];
  if (a.daily.date === b.daily.date) {
    daily = {
      date: a.daily.date,
      seconds: Math.max(a.daily.seconds, b.daily.seconds),
      dismissed: a.daily.dismissed || b.daily.dismissed,
    };
  } else {
    daily = a.daily.date > b.daily.date ? a.daily : b.daily;
  }

  const history: Record<string, number> = { ...a.history };
  for (const [day, sec] of Object.entries(b.history)) {
    history[day] = Math.max(history[day] ?? 0, sec);
  }

  return {
    version: 1,
    stages,
    review,
    session: {
      index: Math.max(a.session.index, b.session.index),
      lastActive: lastActive === 0 ? null : lastActive,
    },
    daily,
    history: pruneHistory(Object.fromEntries(Object.entries(history).sort())),
  };
}

/** 스테이지 한 판 기록 (부모 화면용 로그). id는 브라우저가 만들어 중복 전송을 막는다 */
export interface PlayEvent {
  id: string;
  stageId: string;
  correct: number;
  total: number;
  stars: number;
  /** epoch ms */
  playedAt: number;
}

/** 보낸 기록을 보낸 뒤에 새로 쌓인 것만 남긴다 */
export function removeSent(outbox: PlayEvent[], sent: PlayEvent[]): PlayEvent[] {
  const ids = new Set(sent.map((e) => e.id));
  return outbox.filter((e) => !ids.has(e.id));
}

export const MAX_PLAYS_PER_SYNC = 200;
export const MAX_OUTBOX = 2000;

export function appendOutbox(outbox: PlayEvent[], event: PlayEvent): PlayEvent[] {
  const next = [...outbox, event];
  // 아주 오래 오프라인이어도 브라우저 저장소가 넘치지 않게 오래된 것부터 버린다
  return next.length > MAX_OUTBOX ? next.slice(next.length - MAX_OUTBOX) : next;
}

/** 보안 컨텍스트(HTTPS)가 아닌 LAN 주소에서도 동작하는 UUID v4 */
export function uuidV4(getRandomValues: (a: Uint8Array) => Uint8Array): string {
  const b = getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
