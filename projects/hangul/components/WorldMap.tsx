"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconLink } from "@/components/IconButton";
import { playSequence, stopAudio } from "../audio/player";
import { worldAudio } from "../audio/ids";
import { WORLDS, type WorldDef } from "../data/curriculum";
import { PETS, getPet } from "../data/pets";
import { isStagePassed, isWorldCleared, isWorldUnlocked, petStageFor, type Progress } from "../lib/progress";
import { useActiveProfileId, useCachedProfiles } from "@/lib/profiles/client";
import { activateProfile, useProgress, useSyncStatus } from "../lib/store";
import { Pet } from "./Pet";
import { Loading, SpeakerButton } from "./ui";

export function WorldMap() {
  const progress = useProgress();
  const router = useRouter();
  const [shake, setShake] = useState<number | null>(null);

  useEffect(() => {
    playSequence(["p_map_welcome"]);
    return () => stopAudio();
  }, []);

  if (!progress) return <Loading />;

  const onTap = (world: WorldDef) => {
    if (isWorldUnlocked(progress, world.id)) {
      playSequence([worldAudio(world.id)]);
      router.push(`/hangul/world/${world.id}`);
    } else {
      setShake(world.id);
      playSequence([worldAudio(world.id), world.playable ? "p_locked" : "p_coming_soon"]);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <IconLink href="/" label="Sugo 처음 화면" color="#ffffff">
          🏠
        </IconLink>
        <h1 className="text-3xl text-sky-900 drop-shadow-sm sm:text-4xl">한글 모험</h1>
        <div className="flex items-center gap-3">
          <ProfileButton />
          <SpeakerButton audio={["p_map_welcome"]} />
          <IconLink href="/hangul/pets" label="펫과 스티커 도감" color="#fff3bf">
            🐾
          </IconLink>
        </div>
      </header>

      <ol className="grid flex-1 grid-cols-2 gap-4 sm:gap-6 landscape:grid-cols-4">
        {WORLDS.map((world) => (
          <li key={world.id} className="flex">
            <WorldTile
              world={world}
              progress={progress}
              shaking={shake === world.id}
              onAnimationEnd={() => setShake(null)}
              onTap={() => onTap(world)}
            />
          </li>
        ))}
      </ol>
    </main>
  );
}

/** 지금 아이 (누르면 다른 아이로 바꾸기). 서버와 연결이 끊기면 작은 구름 표시 */
function ProfileButton() {
  const id = useActiveProfileId();
  const profiles = useCachedProfiles();
  const sync = useSyncStatus();
  const me = profiles.find((p) => p.id === id);
  const pet = getPet(me?.avatar ?? "") ?? PETS[0];
  return (
    <button
      type="button"
      onClick={() => activateProfile(null)}
      aria-label={`${me?.nickname ?? "아이"} (다른 아이로 바꾸기)`}
      className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg transition active:scale-95"
    >
      <Pet pet={pet} stage={2} size={56} />
      {sync === "offline" && (
        <span className="absolute -bottom-1 -right-1 text-xl" title="서버에 연결 안 됨 (진도는 이 기기에 저장 중)">
          ☁️
        </span>
      )}
    </button>
  );
}

function WorldTile({
  world,
  progress,
  shaking,
  onTap,
  onAnimationEnd,
}: {
  world: WorldDef;
  progress: Progress;
  shaking: boolean;
  onTap: () => void;
  onAnimationEnd: () => void;
}) {
  const unlocked = isWorldUnlocked(progress, world.id);
  const cleared = unlocked && isWorldCleared(progress, world);
  const current = unlocked && !cleared;
  const passed = world.stages.filter((s) => isStagePassed(progress, s.id)).length;
  const pet = getPet(world.petId)!;

  return (
    <button
      type="button"
      onClick={onTap}
      onAnimationEnd={onAnimationEnd}
      aria-label={`${world.id}. ${world.name}${unlocked ? "" : " (잠김)"}`}
      className={`relative flex min-h-40 w-full flex-col items-center justify-center gap-1 rounded-[2rem] border-b-8 p-3 shadow-xl transition active:translate-y-1 active:border-b-2 ${
        unlocked ? "border-black/15" : "border-black/10 grayscale"
      } ${current ? "animate-glow" : ""} ${shaking ? "animate-wiggle" : ""}`}
      style={{ backgroundColor: unlocked ? world.color : "#cfd8dc" }}
    >
      <span className="absolute left-3 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-xl text-slate-700">
        {world.id}
      </span>
      <span className="text-6xl drop-shadow sm:text-7xl" aria-hidden>
        {world.emoji}
      </span>
      {unlocked ? (
        <>
          <span className="absolute bottom-1 right-1">
            <Pet pet={pet} stage={petStageFor(progress, world)} size={64} />
          </span>
          <span className="flex gap-1" aria-hidden>
            {world.stages.map((s, i) => (
              <span
                key={s.id}
                className={`h-3 w-3 rounded-full ${i < passed ? "bg-yellow-300" : "bg-white/50"}`}
              />
            ))}
          </span>
        </>
      ) : (
        <span className="absolute right-3 top-2 text-3xl" aria-hidden>
          🔒
        </span>
      )}
      <span className="text-xl text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">{world.name}</span>
    </button>
  );
}
