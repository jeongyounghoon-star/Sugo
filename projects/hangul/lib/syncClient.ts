/**
 * 브라우저 쪽 진도 캐시 + 서버 동기화.
 * - 진도는 항상 브라우저(localStorage)에 먼저 저장 → 서버가 꺼져 있어도 계속 놀 수 있다.
 * - 연결되면 PUT /api/hangul/progress/:id 로 보내고, 서버가 합친 결과를 다시 합쳐 저장한다.
 * storage/fetch를 인자로 받아 테스트할 수 있다.
 */
import { createProgress, type Progress } from "./progress";
import { parseProgress, STORAGE_KEY as LEGACY_KEY } from "./storage";
import { MAX_PLAYS_PER_SYNC, mergeProgress, removeSent, type PlayEvent } from "./sync";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LocalState {
  progress: Progress;
  /** 마지막으로 본 서버 epoch (한 번도 동기화 안 했으면 null) */
  epoch: number | null;
  /** 아직 서버에 못 보낸 스테이지 기록 */
  outbox: PlayEvent[];
}

export const localKey = (profileId: string) => `sugo.hangul.v2.${profileId}`;

export function emptyLocal(): LocalState {
  return { progress: createProgress(), epoch: null, outbox: [] };
}

export function loadLocal(storage: StorageLike, profileId: string): LocalState {
  try {
    const raw = storage.getItem(localKey(profileId));
    if (!raw) return emptyLocal();
    const data = JSON.parse(raw) as Partial<LocalState>;
    return {
      progress: parseProgress(JSON.stringify(data.progress ?? null)),
      epoch: typeof data.epoch === "number" ? data.epoch : null,
      outbox: Array.isArray(data.outbox) ? data.outbox : [],
    };
  } catch {
    return emptyLocal();
  }
}

export function saveLocal(storage: StorageLike, profileId: string, state: LocalState): void {
  try {
    storage.setItem(localKey(profileId), JSON.stringify(state));
  } catch {
    // 저장소가 가득 차거나 막혀도 게임은 계속
  }
}

export function clearLocal(storage: StorageLike, profileId: string): void {
  try {
    storage.removeItem(localKey(profileId));
  } catch {
    // 무시
  }
}

/**
 * 예전(로그인/프로필 없던 MVP) localStorage 진도가 있으면 이 프로필로 옮긴다. 한 번만.
 * @returns 옮겼으면 true
 */
export function migrateLegacy(storage: StorageLike, profileId: string): boolean {
  let raw: string | null;
  try {
    raw = storage.getItem(LEGACY_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  const legacy = parseProgress(raw);
  const local = loadLocal(storage, profileId);
  saveLocal(storage, profileId, { ...local, progress: mergeProgress(local.progress, legacy) });
  try {
    storage.removeItem(LEGACY_KEY);
  } catch {
    // 무시
  }
  return true;
}

export interface SyncResponse {
  progress: Progress;
  epoch: number;
  replaced: boolean;
}

/** 서버 응답을 (요청 중에 바뀌었을 수 있는) 현재 로컬 상태에 반영 */
export function applySyncResponse(now: LocalState, sent: PlayEvent[], res: SyncResponse): LocalState {
  if (res.replaced) {
    // 부모가 초기화함 → 로컬 진도와 못 보낸 기록을 버리고 서버 것을 따른다
    return { progress: res.progress, epoch: res.epoch, outbox: [] };
  }
  return {
    progress: mergeProgress(now.progress, res.progress),
    epoch: res.epoch,
    outbox: removeSent(now.outbox, sent),
  };
}

export type SyncResult = "ok" | "replaced" | "offline" | "gone";

export async function syncOnce(storage: StorageLike, fetchFn: FetchLike, profileId: string): Promise<SyncResult> {
  const before = loadLocal(storage, profileId);
  const sent = before.outbox.slice(0, MAX_PLAYS_PER_SYNC);
  let res: Response;
  try {
    res = await fetchFn(`/api/hangul/progress/${encodeURIComponent(profileId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ progress: before.progress, plays: sent, epoch: before.epoch }),
    });
  } catch {
    return "offline";
  }
  if (res.status === 404) return "gone";
  if (!res.ok) return "offline";
  let data: SyncResponse;
  try {
    data = (await res.json()) as SyncResponse;
  } catch {
    return "offline";
  }
  const now = loadLocal(storage, profileId);
  saveLocal(storage, profileId, applySyncResponse(now, sent, data));
  return data.replaced ? "replaced" : "ok";
}
