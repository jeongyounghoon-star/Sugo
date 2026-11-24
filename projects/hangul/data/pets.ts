/**
 * 오리지널 수집형 펫. (기존 캐릭터와 무관한 자체 디자인, SVG로 그림)
 * 각 월드마다 한 마리: 알 → 아기 → 진화.
 */

export type PetFeature =
  | "sprout"
  | "horns"
  | "antenna"
  | "bolt"
  | "fin"
  | "spikes"
  | "star"
  | "crown";

export interface PetDef {
  id: string;
  name: string;
  worldId: number;
  body: string;
  belly: string;
  accent: string;
  feature: PetFeature;
}

export const PETS: readonly PetDef[] = [
  { id: "porong", name: "포롱", worldId: 1, body: "#8bd46e", belly: "#d9f5c8", accent: "#3f9b2c", feature: "sprout" },
  { id: "dodam", name: "도담", worldId: 2, body: "#ffb35c", belly: "#ffe6c4", accent: "#e0701b", feature: "horns" },
  { id: "mallang", name: "말랑", worldId: 3, body: "#ff9ec4", belly: "#ffe0ec", accent: "#d9467e", feature: "antenna" },
  { id: "ttukttak", name: "뚝딱", worldId: 4, body: "#7cc0ff", belly: "#d8ecff", accent: "#2a78c9", feature: "bolt" },
  { id: "challang", name: "찰랑", worldId: 5, body: "#6fe0e6", belly: "#d4f7f8", accent: "#1c9aa3", feature: "fin" },
  { id: "dandan", name: "단단", worldId: 6, body: "#c49a78", belly: "#efdfd0", accent: "#7c5537", feature: "spikes" },
  { id: "banjjak", name: "반짝", worldId: 7, body: "#ffd84d", belly: "#fff3bf", accent: "#d19a00", feature: "star" },
  { id: "duru", name: "두루", worldId: 8, body: "#c39bff", belly: "#ece0ff", accent: "#7a43d6", feature: "crown" },
];

export function getPet(id: string): PetDef | undefined {
  return PETS.find((p) => p.id === id);
}

/** 0: 아직 못 만남(잠김), 1: 알, 2: 아기, 3: 진화 */
export type PetStage = 0 | 1 | 2 | 3;
