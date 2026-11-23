/**
 * Sugo 허브에 보이는 프로젝트 목록 (한 곳에서 관리).
 * 새 프로젝트를 만들면 여기에 한 줄 추가하세요. 자세한 방법은 README 참고.
 */

export interface ProjectInfo {
  /** URL 경로이자 projects/<slug> 폴더 이름 */
  slug: string;
  title: string;
  /** 부모/어른용 한 줄 설명 */
  description: string;
  /** 카드 그림 */
  emoji: string;
  /** 카드 배경색 (hex) */
  color: string;
  /** 카드 위 작은 표시 (예: 만 5세) */
  tags: string[];
  status: "live" | "soon";
}

export const PROJECTS: readonly ProjectInfo[] = [
  {
    slug: "hangul",
    title: "한글 모험",
    description: "만 5세를 위한 6개월 한글 읽기 모험. 소리 듣고, 글자 만들고, 펫을 키워요.",
    emoji: "🐣",
    color: "#ffcf5c",
    tags: ["만 5세", "한글", "태블릿"],
    status: "live",
  },
];

export function projectHref(p: ProjectInfo): string {
  return `/${p.slug}`;
}
