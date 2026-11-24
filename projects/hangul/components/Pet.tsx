import type { ReactNode } from "react";
import type { PetDef, PetFeature, PetStage } from "../data/pets";

/**
 * 오리지널 펫 그림 (SVG). stage: 0 잠김 / 1 알 / 2 아기 / 3 진화
 */
export function Pet({
  pet,
  stage,
  size = 160,
  className = "",
}: {
  pet: PetDef;
  stage: PetStage;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={stage === 0 ? "아직 못 만난 펫" : `${pet.name} (${["", "알", "아기", "진화"][stage]})`}
    >
      <ellipse cx="100" cy="186" rx={stage === 3 ? 62 : 46} ry="8" fill="#000" opacity="0.08" />
      {stage === 0 && <Locked />}
      {stage === 1 && <Egg pet={pet} />}
      {stage === 2 && <Baby pet={pet} />}
      {stage === 3 && <Grown pet={pet} />}
    </svg>
  );
}

function Locked() {
  return (
    <g>
      <path d="M100 40c-34 0-56 44-56 84 0 34 24 58 56 58s56-24 56-58c0-40-22-84-56-84z" fill="#d7d3dc" />
      <text x="100" y="140" textAnchor="middle" fontSize="64" fill="#a39fab" fontFamily="sans-serif" fontWeight="700">
        ?
      </text>
    </g>
  );
}

function Egg({ pet }: { pet: PetDef }) {
  return (
    <g className="animate-breathe">
      <path d="M100 30c-36 0-60 50-60 92 0 36 26 62 60 62s60-26 60-62c0-42-24-92-60-92z" fill="#fffaf0" stroke="#efe4cf" strokeWidth="3" />
      <circle cx="76" cy="92" r="11" fill={pet.body} />
      <circle cx="122" cy="72" r="8" fill={pet.body} />
      <circle cx="128" cy="128" r="14" fill={pet.body} />
      <circle cx="82" cy="146" r="9" fill={pet.body} />
      <circle cx="104" cy="108" r="6" fill={pet.accent} opacity="0.6" />
      <path d="M58 118l12 -8 10 10 12 -10 10 10 12 -10 10 10 12-8" stroke="#e8dcc4" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Face({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const e = 22 * scale;
  return (
    <g>
      <circle cx={cx - e} cy={cy} r={10 * scale} fill="#2d2a32" />
      <circle cx={cx + e} cy={cy} r={10 * scale} fill="#2d2a32" />
      <circle cx={cx - e + 3.5 * scale} cy={cy - 4 * scale} r={3.5 * scale} fill="#fff" />
      <circle cx={cx + e + 3.5 * scale} cy={cy - 4 * scale} r={3.5 * scale} fill="#fff" />
      <ellipse cx={cx - e - 12 * scale} cy={cy + 16 * scale} rx={9 * scale} ry={5 * scale} fill="#ff8fa3" opacity="0.55" />
      <ellipse cx={cx + e + 12 * scale} cy={cy + 16 * scale} rx={9 * scale} ry={5 * scale} fill="#ff8fa3" opacity="0.55" />
      <path
        d={`M${cx - 8 * scale} ${cy + 12 * scale} q${8 * scale} ${9 * scale} ${16 * scale} 0`}
        stroke="#2d2a32"
        strokeWidth={3.5 * scale}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/** 머리 꼭대기(x, y)에 붙는 특징. big=true면 진화형 */
function Feature({ pet, x, y, big }: { pet: PetDef; x: number; y: number; big: boolean }) {
  const s = big ? 1.35 : 0.9;
  const c = pet.accent;
  const shapes: Record<PetFeature, ReactNode> = {
    sprout: (
      <g>
        <path d={`M${x} ${y + 4} q-2 -${18 * s} 0 -${26 * s}`} stroke={c} strokeWidth={4 * s} fill="none" strokeLinecap="round" />
        <path d={`M${x} ${y - 18 * s} c${14 * s} -${16 * s} ${30 * s} -${10 * s} ${34 * s} -${4 * s} c-${12 * s} ${12 * s} -${26 * s} ${12 * s} -${34 * s} ${4 * s}z`} fill={c} />
        <path d={`M${x} ${y - 14 * s} c-${12 * s} -${12 * s} -${26 * s} -${8 * s} -${30 * s} -${2 * s} c${10 * s} ${10 * s} ${22 * s} ${8 * s} ${30 * s} ${2 * s}z`} fill={pet.body} stroke={c} strokeWidth="2" />
        {big && <circle cx={x + 30} cy={y - 34} r="7" fill="#ffd84d" />}
      </g>
    ),
    horns: (
      <g fill={c}>
        <path d={`M${x - 26 * s} ${y + 8} q-${6 * s} -${22 * s} ${4 * s} -${30 * s} q${2 * s} ${16 * s} ${12 * s} ${26 * s}z`} />
        <path d={`M${x + 26 * s} ${y + 8} q${6 * s} -${22 * s} -${4 * s} -${30 * s} q-${2 * s} ${16 * s} -${12 * s} ${26 * s}z`} />
      </g>
    ),
    antenna: (
      <g>
        <path d={`M${x - 12} ${y + 4} q-${8 * s} -${18 * s} -${14 * s} -${26 * s}`} stroke={c} strokeWidth={3.5 * s} fill="none" strokeLinecap="round" />
        <path d={`M${x + 12} ${y + 4} q${8 * s} -${18 * s} ${14 * s} -${26 * s}`} stroke={c} strokeWidth={3.5 * s} fill="none" strokeLinecap="round" />
        <circle cx={x - 12 - 14 * s} cy={y - 24 * s} r={7 * s} fill={c} />
        <circle cx={x + 12 + 14 * s} cy={y - 24 * s} r={7 * s} fill={c} />
      </g>
    ),
    bolt: (
      <path
        d={`M${x + 4 * s} ${y - 34 * s} l-${16 * s} ${22 * s} h${12 * s} l-${6 * s} ${18 * s} l${18 * s} -${24 * s} h-${12 * s}z`}
        fill="#ffd84d"
        stroke={c}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    ),
    fin: (
      <path d={`M${x - 18 * s} ${y + 8} q${14 * s} -${44 * s} ${40 * s} -${30 * s} q-${14 * s} ${10 * s} -${8 * s} ${30 * s}z`} fill={c} />
    ),
    spikes: (
      <path
        d={`M${x - 30 * s} ${y + 10} l${8 * s} -${22 * s} l${10 * s} ${16 * s} l${12 * s} -${24 * s} l${12 * s} ${24 * s} l${10 * s} -${16 * s} l${8 * s} ${22 * s}z`}
        fill={c}
      />
    ),
    star: (
      <path
        d={`M${x} ${y - 36 * s} l${7 * s} ${14 * s} l${15 * s} ${2 * s} l-${11 * s} ${10 * s} l${3 * s} ${15 * s} l-${14 * s} -${7 * s} l-${14 * s} ${7 * s} l${3 * s} -${15 * s} l-${11 * s} -${10 * s} l${15 * s} -${2 * s}z`}
        fill="#fff3bf"
        stroke={c}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    ),
    crown: (
      <path
        d={`M${x - 24 * s} ${y + 4} l-${4 * s} -${26 * s} l${14 * s} ${12 * s} l${14 * s} -${20 * s} l${14 * s} ${20 * s} l${14 * s} -${12 * s} l-${4 * s} ${26 * s}z`}
        fill="#ffd84d"
        stroke={c}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    ),
  };
  return <>{shapes[pet.feature]}</>;
}

function Baby({ pet }: { pet: PetDef }) {
  return (
    <g className="animate-breathe">
      <Feature pet={pet} x={100} y={84} big={false} />
      <ellipse cx="76" cy="176" rx="14" ry="9" fill={pet.accent} />
      <ellipse cx="124" cy="176" rx="14" ry="9" fill={pet.accent} />
      <circle cx="100" cy="130" r="54" fill={pet.body} />
      <ellipse cx="100" cy="148" rx="34" ry="28" fill={pet.belly} />
      <Face cx={100} cy={118} scale={0.9} />
    </g>
  );
}

function Grown({ pet }: { pet: PetDef }) {
  return (
    <g className="animate-breathe">
      <Feature pet={pet} x={100} y={50} big />
      {/* 꼬리 */}
      <path d="M160 150 q34 -6 28 -40 q-6 18 -30 20z" fill={pet.accent} />
      <ellipse cx="70" cy="178" rx="20" ry="11" fill={pet.accent} />
      <ellipse cx="130" cy="178" rx="20" ry="11" fill={pet.accent} />
      <path d="M100 48c-44 0-72 40-72 82 0 34 30 52 72 52s72-18 72-52c0-42-28-82-72-82z" fill={pet.body} />
      <ellipse cx="100" cy="142" rx="44" ry="34" fill={pet.belly} />
      {/* 팔 */}
      <ellipse cx="36" cy="128" rx="12" ry="20" fill={pet.body} transform="rotate(25 36 128)" />
      <ellipse cx="164" cy="128" rx="12" ry="20" fill={pet.body} transform="rotate(-25 164 128)" />
      <Face cx={100} cy={100} scale={1.05} />
      {/* 반짝이 */}
      <path d="M30 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" fill="#ffd84d" />
      <path d="M172 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z" fill="#ffd84d" />
    </g>
  );
}
