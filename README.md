# 한글 모험 (Sugo)

만 5세를 위한 **6개월 한글 읽기 모험** 웹앱입니다. 사이트 주소(`/`)로 들어가면 바로 한글 모험이 열립니다.
Next.js(App Router) + TypeScript + Tailwind CSS 단일 앱이고, 태블릿 홈 화면에 설치할 수 있는 PWA입니다.
다른 프로젝트(예: 카가하우스)는 이 저장소에 넣지 않고 각각 별도 웹으로 만듭니다.

| 경로 | 내용 |
| --- | --- |
| `/` | `/hangul` 로 이동 |
| `/hangul` | 🐣 **한글 모험**: 만 5세 6개월 한글 읽기 (MVP: 월드 1~2) |
| `/parent` | ⚙️ 부모 설정 (부모 PIN 6~10자리: 프로필 삭제/초기화/이름 변경) |
| `/api/*` | 프로필·진도 API (Postgres) |

## 집 PC 에 설치 (Docker, LAN 전용)

- 설치: **[docs/deploy-windows.md](docs/deploy-windows.md)** (Windows + Docker Desktop, 초보용 단계별)
- 보안 설계와 설치 후 점검: **[docs/security.md](docs/security.md)**
- 구성: `docker-compose.yml` = `web`(Next.js standalone) + `db`(Postgres 16, 내부망 전용) + `backup`(매일 pg_dump, 14개 보관)
- 배포: main 머지 → CI 통과 → GitHub Actions 가 `ghcr.io/jeongyounghoon-star/sugo` 에 이미지 푸시 → PC 작업 스케줄러가 10분마다 `deploy/update.ps1` 로 **서명 확인 후** digest 고정 갱신 (업데이트 전 자동 백업)

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 단위 테스트 (vitest)
npm run lint
npm run typecheck
npm run build && npm start
```

DB 없이도 화면은 뜨지만 프로필/진도 저장은 Postgres 가 필요합니다. 로컬에서 DB 까지 쓰려면 `DATABASE_URL=postgres://...` 를 주고 실행하세요 (서버 시작 시 `db/migrations` 자동 적용).
스키마를 바꾸면 `npm run db:generate` 로 마이그레이션 SQL 을 만들어 커밋합니다. API/동기화 테스트는 메모리 Postgres(PGlite)로 돌아서 DB 설치가 필요 없습니다.

Node 24 기준입니다. 태블릿에서 열고 브라우저 메뉴의 "홈 화면에 추가"로 설치하세요 (가로/세로 모두 지원).

## 폴더 구조

```
app/                    # 라우트만 (얇게), app/api = API 라우트
  manifest.ts           #   PWA 매니페스트
  hangul/...            #   한글 모험 라우트
components/             # 공용 UI (큰 버튼, 프로필 고르기, 부모 화면)
lib/                    # 공용 로직: profiles/(프로필), server/(API 보호, PIN)
db/                     # Drizzle 스키마 + 마이그레이션 SQL
deploy/                 # 집 PC 설치/업데이트/백업 스크립트
projects/
  hangul/               # 한글 모험 코드
    data/               #   커리큘럼(26주·월드 8개), 자모, 낱말, 펫
    lib/                #   진도/잠금 해제, 복습(간격 반복), 문제 생성, 저장
    audio/              #   음성 id, TTS 생성 대상 목록, 재생기
    components/         #   지도, 미니게임 3종, 펫 그림 등
public/audio/hangul/    # 미리 생성한 음성 mp3 (커밋됨)
scripts/gen-audio/      # 음성 생성 스크립트
```

## 한글 모험

- 커리큘럼: `projects/hangul/data/curriculum.ts` (26주, 월드 8개, 월드마다 스테이지 5~8개). MVP에서는 `playable: true`인 월드 1~2만 열리고 3~8은 지도에 잠김으로 보입니다.
- 미니게임: 🎈 소리 듣고 글자 풍선 터뜨리기 / 🧩 글자 블록 조립(ㄱ+ㅏ→가, 월드 1은 ㅇ+모음) / 🃏 그림-글자 짝 맞추기.
- 규칙: 첫 시도 정답률 80% 이상이면 별 3개와 다음 스테이지 열림. 틀려도 감점 없이 다시 시도할 수 있습니다.
- 보상: 오리지널 펫(포롱, 도담, …, SVG로 그림). 월드마다 알 → 아기(첫 통과) → 진화(월드 클리어), 별 3개 스테이지마다 스티커 도감.
- 복습: 틀린 글자는 다음 세션(날짜가 바뀌거나 30분 이상 쉰 뒤)에 스테이지 앞부분에 다시 나옵니다 (Leitner 1→2→4 세션 간격).
- 하루 약 10분이 지나면 스테이지가 끝난 뒤 "오늘 끝!" 안내가 뜹니다 (어른용 "조금 더 하기" 버튼 있음).
- 아이는 글을 못 읽는다고 보고 모든 안내는 음성으로, 버튼은 최소 64px 그림 버튼으로 만들었습니다.
- 진도: 아이 프로필(별명 + 펫 아바타, 로그인 없음)별로 서버 Postgres 에 저장합니다. 브라우저에 먼저 저장하고(오프라인/서버 장애 대비) 연결되면 동기화하며, 예전 MVP 의 `localStorage` 진도는 첫 프로필로 자동으로 옮겨집니다.
- DB 테이블: 공용 `profiles`, `settings` / 한글 모험 `hangul_progress`, `hangul_plays`, `hangul_daily_time`.

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
