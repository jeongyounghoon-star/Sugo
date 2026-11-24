"use client";

import { useEffect, useState } from "react";
import { IconButton, IconLink } from "@/components/IconButton";
import { glyphAudio } from "../audio/ids";
import { playSequence, preload, stopAudio } from "../audio/player";
import { getStage, getWorld, nextStage } from "../data/curriculum";
import { getPet } from "../data/pets";
import {
  isStageUnlocked,
  petStageFor,
  recordStageResult,
  shouldShowDailyDone,
  type StageResult,
} from "../lib/progress";
import { generateQuestions, isReviewable, seededRng, type Question } from "../lib/questions";
import { dueItems, recordAnswer } from "../lib/review";
import { getProgress, recordPlay, updateProgress, useProgress } from "../lib/store";
import { DailyDoneOverlay } from "./DailyDoneOverlay";
import { BalloonGame } from "./games/BalloonGame";
import { BlockGame } from "./games/BlockGame";
import type { AnswerResult } from "./games/common";
import { MatchGame } from "./games/MatchGame";
import { Pet } from "./Pet";
import { Loading, SpeakerButton, Stars } from "./ui";

type Phase =
  | { name: "intro" }
  | { name: "play"; questions: Question[]; index: number; correct: number; total: number }
  | { name: "result"; result: StageResult };

export function PlayStage({ stageId }: { stageId: string }) {
  const stage = getStage(stageId)!;
  const world = getWorld(stage.worldId)!;
  const progress = useProgress();
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [showDailyDone, setShowDailyDone] = useState(false);

  useEffect(() => () => stopAudio(), []);

  if (!progress) return <Loading />;

  if (!isStageUnlocked(progress, stageId)) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <span className="text-8xl" aria-hidden>
          🔒
        </span>
        <SpeakerButton audio={["p_locked"]} size="lg" />
        <IconLink href={`/hangul/world/${world.id}`} label="월드로" size="xl">
          🗺️
        </IconLink>
      </main>
    );
  }

  const start = () => {
    const p = getProgress();
    const review = dueItems(p.review, p.session.index, isReviewable);
    const questions = generateQuestions(stage, { rng: seededRng(Date.now()), reviewItems: review });
    setPhase({ name: "play", questions, index: 0, correct: 0, total: 0 });
  };

  const onAnswered = (results: AnswerResult[]) => {
    if (phase.name !== "play") return;
    updateProgress((p) => ({
      ...p,
      review: results.reduce((r, a) => recordAnswer(r, a.item, a.correct, p.session.index), p.review),
    }));
    const correct = phase.correct + results.filter((r) => r.correct).length;
    const total = phase.total + results.length;
    const index = phase.index + 1;
    if (index < phase.questions.length) {
      setPhase({ ...phase, index, correct, total });
      return;
    }
    const r = recordStageResult(getProgress(), stageId, correct, total);
    updateProgress(() => r.progress);
    recordPlay({ stageId, correct, total, stars: r.stars });
    setPhase({ name: "result", result: r });
    const voices = [r.stars >= 3 ? "p_stage_clear_3" : "p_stage_clear_low"];
    if (r.newSticker) voices.push("p_sticker");
    if (r.worldCleared) voices.push("p_world_clear");
    else if (r.petHatched) voices.push("p_pet_hatch");
    playSequence(voices, 400).then(() => {
      if (shouldShowDailyDone(getProgress())) setShowDailyDone(true);
    });
  };

  return (
    <main className="flex flex-1 flex-col gap-2 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <IconLink href={`/hangul/world/${world.id}`} label="그만하고 월드로" color="#ffffff" onClick={() => stopAudio()}>
          ⬅️
        </IconLink>
        {phase.name === "play" && <ProgressDots done={phase.index} total={phase.questions.length} />}
        <span className="h-16 w-16" aria-hidden />
      </header>

      {phase.name === "intro" && <Intro letters={stage.focus} color={world.color} onStart={start} />}

      {phase.name === "play" && (
        <QuestionView
          key={phase.index}
          question={phase.questions[phase.index]}
          showHowTo={
            phase.index === 0 ||
            phase.questions[phase.index].kind !== phase.questions[phase.index - 1].kind
          }
          onDone={onAnswered}
        />
      )}

      {phase.name === "result" && (
        <Result
          result={phase.result}
          worldId={world.id}
          stageId={stageId}
          onRetry={() => {
            stopAudio();
            start();
          }}
        />
      )}

      {showDailyDone && <DailyDoneOverlay />}
    </main>
  );
}

function ProgressDots({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label={`${total}문제 중 ${done}개`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-4 w-4 rounded-full sm:h-5 sm:w-5 ${i < done ? "bg-yellow-400" : i === done ? "bg-sky-500" : "bg-white"}`}
        />
      ))}
    </div>
  );
}

function QuestionView({
  question,
  showHowTo,
  onDone,
}: {
  question: Question;
  showHowTo: boolean;
  onDone: (r: AnswerResult[]) => void;
}) {
  if (question.kind === "balloon") return <BalloonGame question={question} showHowTo={showHowTo} onDone={onDone} />;
  if (question.kind === "block") return <BlockGame question={question} showHowTo={showHowTo} onDone={onDone} />;
  return <MatchGame question={question} showHowTo={showHowTo} onDone={onDone} />;
}

/** 새 글자 만나기: 글자를 눌러 소리를 듣고, ▶ 를 누르면 시작 */
function Intro({ letters, color, onStart }: { letters: string[]; color: string; onStart: () => void }) {
  useEffect(() => {
    const ids = letters.flatMap(glyphAudio);
    preload(ids);
    playSequence(["p_intro", ...(letters.length <= 4 ? ids : [])], 350);
    return () => stopAudio();
  }, [letters]);

  const big = letters.length <= 2;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {letters.map((ch) => (
          <button
            key={ch}
            type="button"
            aria-label={`글자 ${ch} 듣기`}
            onClick={() => playSequence(glyphAudio(ch), 300)}
            className={`animate-bounce-in flex items-center justify-center rounded-[2rem] border-b-8 border-black/20 text-white shadow-xl transition active:translate-y-1 ${
              big ? "h-44 w-44 text-[7rem] sm:h-52 sm:w-52 sm:text-[8.5rem]" : "h-24 w-24 text-6xl sm:h-28 sm:w-28 sm:text-7xl"
            }`}
            style={{ backgroundColor: color }}
          >
            {ch}
          </button>
        ))}
      </div>
      <IconButton label="시작" size="xl" color="#69db7c" onClick={onStart} className="animate-glow">
        ▶️
      </IconButton>
    </div>
  );
}

function Result({
  result,
  worldId,
  stageId,
  onRetry,
}: {
  result: StageResult;
  worldId: number;
  stageId: string;
  onRetry: () => void;
}) {
  const world = getWorld(worldId)!;
  const pet = getPet(world.petId)!;
  const next = nextStage(stageId);
  const canNext = next && isStageUnlocked(result.progress, next.id);
  const showPet = result.petHatched || result.worldCleared;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="animate-bounce-in">
        <Stars count={result.stars} size="text-7xl sm:text-8xl" />
      </div>
      {showPet && (
        <div className="animate-bounce-in flex flex-col items-center">
          <Pet pet={pet} stage={petStageFor(result.progress, world)} size={200} />
          <span className="text-3xl" aria-hidden>
            {result.worldCleared ? "🎉✨🎉" : "🐣"}
          </span>
        </div>
      )}
      {result.newSticker && !showPet && (
        <span className="animate-bounce-in text-7xl" aria-label="새 스티커">
          🏅
        </span>
      )}
      <div className="flex flex-wrap items-center justify-center gap-5">
        <IconButton label="한 번 더" size="lg" color="#fff3bf" onClick={onRetry}>
          🔁
        </IconButton>
        <IconLink href={`/hangul/world/${worldId}`} label="월드로" size="lg" color="#ffffff" onClick={() => stopAudio()}>
          🗺️
        </IconLink>
        {canNext && next && (
          <IconLink
            href={next.worldId === worldId ? `/hangul/play/${next.id}` : `/hangul/world/${next.worldId}`}
            label="다음 놀이"
            size="xl"
            color="#69db7c"
            className="animate-glow"
            onClick={() => stopAudio()}
          >
            ▶️
          </IconLink>
        )}
      </div>
    </div>
  );
}
