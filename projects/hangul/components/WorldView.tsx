"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconLink } from "@/components/IconButton";
import { glyphAudio, petAudio, worldAudio } from "../audio/ids";
import { playSequence, stopAudio } from "../audio/player";
import { getWorld, type StageDef } from "../data/curriculum";
import { getPet } from "../data/pets";
import { currentStageOf, isStageUnlocked, isWorldUnlocked, petStageFor } from "../lib/progress";
import { useProgress } from "../lib/store";
import { Pet } from "./Pet";
import { Loading, SpeakerButton, Stars } from "./ui";

/** 스테이지 동그라미에 보여줄 글자 (많으면 대표 표시) */
export function stageBadge(stage: StageDef): string {
  if (stage.focus.length <= 2) return stage.focus.join(" ");
  return "🌟";
}

export function WorldView({ worldId }: { worldId: number }) {
  const world = getWorld(worldId)!;
  const progress = useProgress();
  const router = useRouter();
  const [shake, setShake] = useState<string | null>(null);

  useEffect(() => {
    playSequence([worldAudio(worldId), "p_stage_pick"]);
    return () => stopAudio();
  }, [worldId]);

  if (!progress) return <Loading />;

  const pet = getPet(world.petId)!;
  const petStage = petStageFor(progress, world);

  if (!isWorldUnlocked(progress, world.id)) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <span className="text-8xl grayscale" aria-hidden>
          {world.emoji}
        </span>
        <span className="text-6xl" aria-hidden>
          🔒
        </span>
        <SpeakerButton audio={[world.playable ? "p_locked" : "p_coming_soon"]} size="lg" />
        <IconLink href="/hangul" label="지도로" size="xl" color="#ffffff">
          🗺️
        </IconLink>
      </main>
    );
  }

  const current = currentStageOf(progress, world);

  const onStage = (stage: StageDef) => {
    if (isStageUnlocked(progress, stage.id)) {
      playSequence(stage.focus.length <= 2 ? stage.focus.flatMap(glyphAudio) : []);
      router.push(`/hangul/play/${stage.id}`);
    } else {
      setShake(stage.id);
      playSequence(["p_locked"]);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <IconLink href="/hangul" label="지도로" color="#ffffff">
          🗺️
        </IconLink>
        <h1 className="flex items-center gap-2 text-3xl sm:text-4xl" style={{ color: world.color }}>
          <span aria-hidden>{world.emoji}</span>
          <span className="drop-shadow-[0_1px_0_white]">{world.name}</span>
        </h1>
        <SpeakerButton audio={[worldAudio(world.id), "p_stage_pick"]} />
      </header>

      <div className="flex flex-1 flex-col items-center gap-6 landscape:flex-row">
        <button
          type="button"
          aria-label={`${pet.name} 펫`}
          onClick={() => playSequence([petAudio(pet.id)])}
          className="flex shrink-0 flex-col items-center rounded-[2rem] bg-white/70 p-4 shadow-lg"
        >
          <Pet pet={pet} stage={petStage} size={180} />
          <span className="text-2xl text-slate-700">{pet.name}</span>
        </button>

        <ol className="flex flex-1 flex-wrap content-center items-center justify-center gap-5">
          {world.stages.map((stage) => {
            const unlocked = isStageUnlocked(progress, stage.id);
            const stars = progress.stages[stage.id]?.bestStars ?? 0;
            const isCurrent = stage.id === current;
            return (
              <li key={stage.id} className={`flex flex-col items-center gap-1 ${stage.order % 2 === 0 ? "translate-y-6" : ""}`}>
                <button
                  type="button"
                  onClick={() => onStage(stage)}
                  onAnimationEnd={() => setShake(null)}
                  aria-label={`${stage.order}번 놀이${unlocked ? "" : " (잠김)"}`}
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full border-b-8 text-4xl shadow-lg transition active:translate-y-1 active:border-b-2 sm:h-28 sm:w-28 sm:text-5xl ${
                    unlocked ? "border-black/20 text-white" : "border-black/10 bg-slate-300 text-slate-500"
                  } ${isCurrent ? "animate-glow" : ""} ${shake === stage.id ? "animate-wiggle" : ""}`}
                  style={unlocked ? { backgroundColor: world.color } : undefined}
                >
                  {unlocked ? stageBadge(stage) : "🔒"}
                  <span className="absolute -left-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg text-slate-600 shadow">
                    {stage.order}
                  </span>
                </button>
                <Stars count={stars} size="text-xl" />
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
}
