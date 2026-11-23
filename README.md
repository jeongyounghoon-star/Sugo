# Sugo

여러 개의 작은 프로젝트를 **하나의 웹사이트**로 묶어 두는 저장소입니다.
Next.js(App Router) + TypeScript + Tailwind CSS 단일 앱이고, 홈 화면에 설치할 수 있는 PWA입니다.

| 경로 | 내용 |
| --- | --- |
| `/` | Sugo 허브: 프로젝트 카드 목록 |
| `/hangul` | 🐣 **한글 모험**: 만 5세 6개월 한글 읽기 (MVP: 월드 1~2) |

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 단위 테스트 (vitest)
npm run lint
npm run typecheck
npm run build && npm start
```

Node 24 기준입니다. 태블릿에서 열고 브라우저 메뉴의 "홈 화면에 추가"로 설치하세요 (가로/세로 모두 지원).

## 폴더 구조

```
app/                    # 라우트만 (얇게)
  page.tsx              #   허브 홈
  manifest.ts           #   PWA 매니페스트
  hangul/...            #   한글 모험 라우트
components/             # 여러 프로젝트가 함께 쓰는 UI (큰 버튼, 프로젝트 카드, 서비스 워커 등록)
projects/
  registry.ts           # ★ 허브에 보이는 프로젝트 목록 (여기 한 곳에서 관리)
  hangul/               # 한글 모험 전용 코드
    data/               #   커리큘럼(26주·월드 8개), 자모, 낱말, 펫
    lib/                #   진도/잠금 해제, 복습(간격 반복), 문제 생성, 저장
    audio/              #   음성 id, TTS 생성 대상 목록, 재생기
    components/         #   지도, 미니게임 3종, 펫 그림 등
public/audio/hangul/    # 미리 생성한 음성 mp3 (커밋됨)
scripts/gen-audio/      # 음성 생성 스크립트
```

## 새 프로젝트 추가하는 법

1. `projects/<slug>/` 폴더를 만들고 그 프로젝트 전용 코드(데이터, 로직, 컴포넌트)를 넣습니다.
2. `app/<slug>/page.tsx`(필요하면 `layout.tsx`)를 만들어 라우트를 연결합니다. 라우트 파일은 `projects/<slug>`의 컴포넌트를 불러오기만 하게 얇게 둡니다.
3. `projects/registry.ts`의 `PROJECTS` 배열에 한 줄 추가합니다 (`slug`, 제목, 설명, 이모지, 색, `status: "live"`).
4. 여러 프로젝트가 같이 쓸 만한 UI는 `components/`로 올립니다.
5. `npm test`: `projects/registry.test.ts`가 slug 중복과 라우트/폴더 존재를 확인합니다.

## 한글 모험

- 커리큘럼: `projects/hangul/data/curriculum.ts` (26주, 월드 8개, 월드마다 스테이지 5~8개). MVP에서는 `playable: true`인 월드 1~2만 열리고 3~8은 지도에 잠김으로 보입니다.
- 미니게임: 🎈 소리 듣고 글자 풍선 터뜨리기 / 🧩 글자 블록 조립(ㄱ+ㅏ→가, 월드 1은 ㅇ+모음) / 🃏 그림-글자 짝 맞추기.
- 규칙: 첫 시도 정답률 80% 이상이면 별 3개와 다음 스테이지 열림. 틀려도 감점 없이 다시 시도할 수 있습니다.
- 보상: 오리지널 펫(포롱, 도담, …, SVG로 그림). 월드마다 알 → 아기(첫 통과) → 진화(월드 클리어), 별 3개 스테이지마다 스티커 도감.
- 복습: 틀린 글자는 다음 세션(날짜가 바뀌거나 30분 이상 쉰 뒤)에 스테이지 앞부분에 다시 나옵니다 (Leitner 1→2→4 세션 간격).
- 하루 약 10분이 지나면 스테이지가 끝난 뒤 "오늘 끝!" 안내가 뜹니다 (어른용 "조금 더 하기" 버튼 있음).
- 아이는 글을 못 읽는다고 보고 모든 안내는 음성으로, 버튼은 최소 64px 그림 버튼으로 만들었습니다.
- 진도는 로그인 없이 `localStorage`(`sugo.hangul.progress.v1`)에 저장합니다.

### 음성 다시 만들기

음성은 무료 Microsoft Edge 뉴럴 TTS(`edge-tts`, 목소리 `ko-KR-SunHiNeural`)로 미리 만들어 `public/audio/hangul/`에 커밋해 두었습니다. API 키는 필요 없습니다.

```bash
pip install -r scripts/gen-audio/requirements.txt
npm run audio      # 앱 데이터 → scripts/gen-audio/targets.json → 바뀐 mp3만 생성
```

- 생성 대상은 앱 데이터(자모, 음절, 낱말, 안내 문장)에서 자동으로 뽑습니다: `projects/hangul/audio/targets.ts`.
- 자음은 이름("기역")과 아이용 소리("그") 두 가지를 모두 만듭니다.
- `ffmpeg`가 있으면 앞뒤 무음을 잘라 소리가 바로 나오게 합니다 (선택 사항).
- 테스트(`audio.test.ts`)가 targets.json이 최신인지, 모든 mp3가 있는지 확인합니다.
