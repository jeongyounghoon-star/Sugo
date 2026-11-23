"use client";

import { useEffect } from "react";
import { IconLink } from "@/components/IconButton";
import { glyphAudio, petAudio } from "../audio/ids";
import { playSequence, stopAudio } from "../audio/player";
import { WORLDS } from "../data/curriculum";
import { getPet } from "../data/pets";
import { isStagePassed, petStageFor } from "../lib/progress";
import { useProgress } from "../lib/store";
import { Pet } from "./Pet";
import { Loading, SpeakerButton } from "./ui";
import { stageBadge } from "./WorldView";

/** 펫 도감 + 스티커 도감 */
export function PetBook() {
  const progress = useProgress();

  useEffect(() => {
    playSequence(["p_pets"]);
    return () => stopAudio();
  }, []);

  if (!progress) return <Loading />;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <IconLink href="/hangul" label="지도로" color="#ffffff">
          🗺️
        </IconLink>
        <h1 className="text-3xl text-sky-900 sm:text-4xl">🐾 도감</h1>
        <SpeakerButton audio={["p_pets"]} />
      </header>

      <section aria-label="펫" className="grid grid-cols-4 gap-3 sm:gap-4 portrait:grid-cols-2 portrait:sm:grid-cols-4">
        {WORLDS.map((world) => {
          const pet = getPet(world.petId)!;
          const stage = petStageFor(progress, world);
          return (
            <button
              key={pet.id}
              type="button"
              aria-label={stage === 0 ? "아직 못 만난 펫" : pet.name}
              onClick={() => playSequence([stage === 0 ? "p_locked" : petAudio(pet.id)])}
              className="flex flex-col items-center rounded-3xl bg-white/80 p-2 shadow-md transition active:scale-95"
            >
              <Pet pet={pet} stage={stage} size={110} />
              <span className="text-xl text-slate-700">{stage === 0 ? "?" : pet.name}</span>
            </button>
          );
        })}
      </section>

      <section aria-label="스티커" className="flex flex-col gap-4">
        {WORLDS.filter((w) => w.playable).map((world) => (
          <div key={world.id} className="rounded-3xl bg-white/70 p-4 shadow-md">
            <h2 className="mb-3 text-2xl" style={{ color: world.color }}>
              {world.emoji} {world.name}
            </h2>
            <ul className="flex flex-wrap gap-3">
              {world.stages.map((s) => {
                const got = isStagePassed(progress, s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-label={got ? `${s.order}번 스티커` : "아직 없는 스티커"}
                      onClick={() => playSequence(got && s.focus.length <= 2 ? s.focus.flatMap(glyphAudio) : ["p_locked"])}
                      className={`relative flex h-20 w-20 items-center justify-center rounded-full text-3xl transition active:scale-95 ${
                        got ? "border-4 border-white text-white shadow-lg" : "border-4 border-dashed border-slate-300 text-slate-300"
                      }`}
                      style={got ? { backgroundColor: world.color } : undefined}
                    >
                      {got ? stageBadge(s) : s.order}
                      {got && <span className="absolute -right-1 -top-1 text-xl">⭐</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
