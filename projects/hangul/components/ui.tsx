"use client";

import { IconButton } from "@/components/IconButton";
import { playSequence } from "../audio/player";

/** 별 3개 표시 */
export function Stars({ count, size = "text-2xl" }: { count: number; size?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${size}`} aria-label={`별 ${count}개`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? "" : "opacity-25 grayscale"} aria-hidden>
          ⭐
        </span>
      ))}
    </span>
  );
}

/** 다시 듣기 버튼 */
export function SpeakerButton({
  audio,
  onClick,
  label = "다시 듣기",
  size = "md",
}: {
  audio?: string[];
  onClick?: () => void;
  label?: string;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <IconButton
      label={label}
      size={size}
      color="#e3f2fd"
      onClick={() => (onClick ? onClick() : audio && playSequence(audio))}
    >
      🔊
    </IconButton>
  );
}

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center" aria-label="불러오는 중">
      <span className="animate-float text-7xl" aria-hidden>
        🥚
      </span>
    </div>
  );
}
