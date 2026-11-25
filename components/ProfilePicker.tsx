"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/IconButton";
import { createProfile, refreshProfiles, useCachedProfiles } from "@/lib/profiles/client";
import { AVATARS, NICKNAME_MAX } from "@/lib/profiles/shared";
import { playSequence, stopAudio } from "@/projects/hangul/audio/player";
import { Pet } from "@/projects/hangul/components/Pet";
import { PETS, getPet } from "@/projects/hangul/data/pets";

/**
 * 아이 프로필 고르기/만들기 . 글을 몰라도 펫 그림으로 고를 수 있다.
 * 이름(별명)은 어른이 입력. 삭제/초기화는 부모 화면(PIN)에서만.
 */
export function ProfilePicker({ onPick }: { onPick: (id: string) => void }) {
  const profiles = useCachedProfiles();
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    refreshProfiles().then((r) => {
      if (!alive) return;
      setOffline(r.offline);
      setLoaded(true);
      if (r.profiles.length === 0) setCreating(true);
    });
    playSequence(["p_profile_pick"]);
    return () => {
      alive = false;
      stopAudio();
    };
  }, []);

  if (creating) {
    return (
      <CreateProfile
        canCancel={profiles.length > 0}
        onCancel={() => setCreating(false)}
        onCreated={(id) => onPick(id)}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="flex items-center gap-3">
        <IconButton label="다시 듣기" color="#e3f2fd" onClick={() => playSequence(["p_profile_pick"])}>
          🔊
        </IconButton>
      </div>
      {offline && (
        <p className="rounded-full bg-amber-100 px-4 py-2 font-sans text-sm text-amber-800" role="status">
          ☁️ 서버에 연결할 수 없어요. 저장된 목록으로 고를 수 있어요.
        </p>
      )}
      <ul className="flex flex-wrap justify-center gap-6">
        {profiles.map((p) => {
          const pet = getPet(p.avatar) ?? PETS[0];
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                aria-label={p.nickname}
                className="flex w-44 flex-col items-center rounded-[2rem] bg-white/85 p-4 shadow-xl transition active:scale-95"
              >
                <Pet pet={pet} stage={2} size={130} />
                <span className="max-w-full truncate text-2xl text-slate-700">{p.nickname}</span>
              </button>
            </li>
          );
        })}
        {loaded && !offline && (
          <li>
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="새 친구 만들기"
              className="flex h-full min-h-52 w-44 items-center justify-center rounded-[2rem] border-4 border-dashed border-sky-300 bg-white/50 text-7xl text-sky-400 transition active:scale-95"
            >
              ＋
            </button>
          </li>
        )}
      </ul>
    </main>
  );
}

function CreateProfile({
  canCancel,
  onCancel,
  onCreated,
}: {
  canCancel: boolean;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    playSequence(["p_profile_new"]);
    return () => stopAudio();
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await createProfile(nickname.trim(), avatar);
      onCreated(p.id);
    } catch {
      setError("만들지 못했어요. 이름을 확인하거나 잠시 뒤에 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <ul className="grid grid-cols-4 gap-3">
        {PETS.map((pet) => (
          <li key={pet.id}>
            <button
              type="button"
              aria-label={pet.name}
              aria-pressed={avatar === pet.id}
              onClick={() => setAvatar(pet.id)}
              className={`rounded-3xl bg-white/80 p-2 shadow-md transition active:scale-95 ${
                avatar === pet.id ? "ring-8 ring-sky-400" : ""
              }`}
            >
              <Pet pet={pet} stage={2} size={96} />
            </button>
          </li>
        ))}
      </ul>
      <label className="flex flex-col items-center gap-2 font-sans text-slate-600">
        <span>어른이 적어 주세요: 아이 별명 (실명 대신 별명 권장)</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={NICKNAME_MAX}
          autoComplete="off"
          className="h-16 w-72 rounded-2xl border-2 border-sky-200 bg-white px-4 text-center text-2xl text-slate-800 outline-none focus:border-sky-400"
          placeholder="예: 별이"
        />
      </label>
      {error && (
        <p className="font-sans text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-4">
        {canCancel && (
          <IconButton label="취소" size="lg" onClick={onCancel}>
            ✖️
          </IconButton>
        )}
        <IconButton label="만들기" size="lg" color="#69db7c" onClick={submit} disabled={busy || !nickname.trim()}>
          ✔️
        </IconButton>
      </div>
    </main>
  );
}
