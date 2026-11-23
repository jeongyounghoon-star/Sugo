# Sugo 보안 설계

집 Windows PC 에서 **집 LAN 전용**으로 돌리는 가족용 앱입니다. 지키려는 것과 막으려는 것:

- **지킬 것**: 아이 별명/학습 기록, 집 PC 자체 (Docker 를 통한 PC 장악 방지), DB 비밀번호
- **막을 것**: 인터넷에서의 접근, 같은 Wi-Fi 의 다른 기기/웹사이트를 통한 장난(CSRF, DNS 리바인딩), 아이의 실수로 인한 데이터 삭제, 공급망(의존성/액션) 공격, 비밀값 유출

## 1. 네트워크

| 조치 | 이유 |
| --- | --- |
| 공유기 **포트포워딩/UPnP 금지** (문서로 명시) | 인터넷에 열리는 순간 위협 모델이 완전히 달라짐 (HTTPS/로그인 없음) |
| **web 포트(3000)만** 호스트에 노출 | 공격 표면 최소화 |
| Windows 방화벽: **개인(Private) 프로필 + LocalSubnet** 에서만 허용 | PC 를 공용 Wi-Fi 에 연결해도 자동으로 막힘, 집 밖 대역에서 오는 연결 차단 |
| **Postgres 호스트 포트 없음**, `backend` 네트워크는 `internal: true` | DB 는 web/backup 컨테이너에서만 접근, DB 컨테이너는 인터넷으로도 못 나감 |
| backup 서비스도 `backend` 내부망만 | 같은 이유 |
| Docker 데몬 TCP(2375) **노출 금지** 확인 | 켜져 있으면 LAN 누구나 PC 에 root 권한 컨테이너를 띄울 수 있음 |
| `WEB_BIND` 로 특정 LAN IP 에만 바인드 가능 | PC 에 네트워크 카드가 여러 개일 때 범위 축소 |

## 2. 자동 배포

| 조치 | 이유 |
| --- | --- |
| Watchtower 등 **docker.sock 마운트 컨테이너 사용 안 함** | docker.sock = 호스트 root 권한. 그 컨테이너가 뚫리면 PC 전체가 넘어감 |
| 대신 **Windows 작업 스케줄러**가 10분마다 `deploy/update.ps1` (`docker compose pull` + `up -d`) | 호스트 권한은 호스트 스크립트에만 |
| 자동 업데이트는 **이미지만** (compose/스크립트는 `git pull` 로 수동) | 원격 변경이 집 PC 에서 자동 실행되는 범위를 이미지 안으로 제한 |
| 이미지 빌드/푸시는 **main 에서 CI 가 통과한 커밋만** (`workflow_run`, head_branch/repo 확인) | PR/포크 코드가 이미지로 나가지 않게 |
| 워크플로 `permissions: {}` 기본, job 별 최소 권한 (`contents: read`, 푸시 job 만 `packages: write`) | 토큰 탈취 시 피해 최소화 |
| 서드파티 액션은 **커밋 SHA 고정** (주석에 버전) | 태그 바꿔치기 공격 방지. Dependabot 이 갱신 PR 을 올림 |
| `persist-credentials: false` | 체크아웃 후 git 설정에 토큰이 남지 않게 |
| 이미지 provenance + SBOM 첨부 | 무엇으로 만들어졌는지 추적 가능 |

## 3. 컨테이너

| 조치 | web | db | backup |
| --- | --- | --- | --- |
| 비 root 사용자 | node (1000) | postgres (70) | postgres (70) |
| `no-new-privileges` | ✅ | ✅ | ✅ |
| `cap_drop: ALL` | ✅ | ✅ | ✅ |
| 읽기 전용 루트 FS (+ 필요한 tmpfs) | ✅ `/tmp`, `/app/.next/cache` | ✅ `/var/run/postgresql`, `/tmp` | ✅ `/tmp` |
| 메모리/CPU/PID 제한 | 512m / 1 / 256 | 512m / 1 / 200 | 256m / 0.5 / 64 |
| healthcheck | `/api/health` (DB 포함) | `pg_isready` | – |
| `restart: unless-stopped`, 로그 크기 제한 | ✅ | ✅ | ✅ |

- 베이스 이미지는 **태그 + digest 고정**: `node:24.19.0-alpine3.24@sha256:…`, `postgres:16.16-alpine3.24@sha256:…`
- Next.js **standalone** 출력 + alpine. 런타임 이미지에서 npm/npx/corepack 제거.
- 빌드 시 `npm ci --ignore-scripts` (의존성 설치 스크립트 실행 안 함).
- CI 의 `compose-smoke` job 이 실제 `docker-compose.yml` 로 띄워서 위 설정(비 root, read-only, cap drop, no-new-privileges, internal 네트워크, DB 포트 미노출)을 **자동 검사**합니다.

## 4. 비밀값

- DB 비밀번호는 `.env` 에만. `.gitignore`/`.dockerignore` 에 포함, **커밋 금지**.
- `deploy/setup.ps1` 이 `RandomNumberGenerator` 로 **32바이트(64자 hex) 랜덤 비밀번호**를 만들고, `.env` 권한을 현재 사용자/SYSTEM/Administrators 로 제한. 화면에 출력하지 않음.
- CI 의 `secrets` job 이 **gitleaks** 로 전체 git 기록을 검사 (실패 시 머지 불가).
- 이미지에는 비밀값이 없으므로 GHCR 패키지를 Public 으로 둬도 됨.

## 5. 앱

| 조치 | 위치 |
| --- | --- |
| 모든 API 입력을 **zod 로 검증** (strict 객체, 범위, 개수 제한, 스테이지 id 화이트리스트, UUID) | `projects/hangul/lib/schemas.ts`, `lib/profiles/shared.ts` |
| SQL 은 **Drizzle ORM 파라미터 바인딩만** (문자열로 SQL 조립 없음) | `db/`, `*/repo.ts` |
| **요청 크기 제한** (진도 128KB, 그 외 1~2KB) → 413 | `lib/server/http.ts` |
| **rate limit** (토큰 버킷, 읽기/쓰기 별) → 429 | `lib/server/rateLimit.ts` |
| **Host 허용 목록** (IP/localhost/*.local/ALLOWED_HOSTS) | DNS 리바인딩 방어 |
| **Origin 불일치 거부 + 쓰기는 `application/json` 만** | CSRF 방어 (다른 웹사이트가 태블릿 브라우저를 통해 요청하는 것) |
| 보안 헤더: CSP(`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` …), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `X-Frame-Options`, COOP/CORP, `X-Powered-By` 제거 | `next.config.ts` |
| **부모 PIN** (4~6자리, **scrypt + salt 해시** 저장, 5번 틀리면 10분 잠금) | `lib/server/pin.ts` |
| PIN 필요: 프로필 삭제, 학습 기록 초기화, 이름/아바타 변경, PIN 변경, 부모 화면 | API 마다 서버에서 다시 확인 |
| 아이가 할 수 있는 것: 프로필 고르기/만들기(최대 10개), 놀기 | |
| 에러 응답은 `{ "error": "<코드>" }` 만 (스택/SQL 없음) | `handle()` |
| 서버 로그는 에러 종류/코드만, **아이 이름·요청 값 로그 금지** | `handle()`, `db/migrate.ts` |
| 초기화 후 옛 브라우저 캐시가 진도를 되살리지 못하게 epoch 확인 | `progressRepo.ts` |
| `npm audit --audit-level=high` CI 실패 조건 | `.github/workflows/ci.yml` |

**CSP 의 `'unsafe-inline'` (script/style)**: Next.js 가 정적 페이지에 인라인 스크립트(하이드레이션 데이터)를 넣기 때문에 필요합니다. nonce 방식은 모든 페이지를 매 요청 동적 렌더로 바꿔야 해서 쓰지 않았습니다. 외부 스크립트·프레임·플러그인은 모두 막혀 있고, 앱은 사용자 HTML 을 렌더하지 않습니다(React 가 모두 이스케이프).

## 6. 데이터

- 수집: **별명(실명 대신 권장) + 펫 아바타 + 학습 기록**(스테이지 별/정답률, 복습 글자, 날짜별 학습 시간, 판 기록)만. 생일/사진/연락처 없음.
- 프로필 삭제 시 모든 학습 기록 함께 삭제 (FK `ON DELETE CASCADE`).
- 매일 `pg_dump` 백업, 최근 14개 보관. **복구 테스트 스크립트** `deploy/restore-test.ps1` (임시 DB 에 복구 → 행 수 확인 → 삭제).
- 백업 파일은 암호화되어 있지 않습니다. `backups\` 폴더를 외부로 복사할 때는 개인 저장소에만.

## 7. 알려진 한계 (의도적으로 받아들인 것)

- **LAN 안에서는 HTTP** (TLS 없음): 집 Wi-Fi 의 다른 기기가 트래픽을 엿볼 수 있음. 오가는 것은 별명과 학습 기록, 부모 PIN(변경 요청 시). 집 Wi-Fi 비밀번호(WPA2/3)를 신뢰합니다. HTTP 라서 서비스 워커/설치 프롬프트도 꺼집니다.
- **아이 쪽에는 로그인이 없음**: 같은 LAN 의 누구나 프로필 목록과 진도를 볼 수 있고, 프로필을 만들 수 있음 (최대 10개). 삭제/초기화는 PIN 필요.
- PIN 잠금은 기기 구분 없이 전체 기준 (IP 헤더는 위조 가능해서). LAN 안 누군가가 일부러 틀리면 부모도 10분 기다려야 함.
- 처음 PIN 은 먼저 만드는 사람이 정함 → 설치 직후 바로 만들 것.
- rate limit/PIN 잠금은 메모리에 있어 컨테이너 재시작 시 초기화.

## 8. 레포 보안 설정 권장 (GitHub → Settings)

1. **Branches → Branch protection rule (`main`)**
   - Require a pull request before merging (승인 1명 권장)
   - Require status checks to pass: `lint / typecheck / test / build / audit`, `secret scan (gitleaks)`, `docker compose smoke test`
   - Require branches to be up to date, Do not allow bypassing, 강제 푸시/삭제 금지
2. **Code security → Dependabot alerts / Dependabot security updates** 켜기 (`.github/dependabot.yml` 로 버전 업데이트도 주간 PR)
3. **Secret scanning + Push protection** 켜기
4. **Actions → General → Workflow permissions: Read repository contents** (기본 토큰 읽기 전용), "Allow GitHub Actions to create and approve pull requests" 끄기
5. **Actions → General → Require actions to be pinned to a full-length commit SHA** 켜기 (이미 모두 SHA 고정)
6. GHCR 패키지 **sugo**: 레포와 연결(자동), Public 또는 `read:packages` 토큰만 PC 에

## 설치 후 점검 체크리스트

PC 에서 (PowerShell, `C:\sugo`):

- [ ] `docker compose ps` → web, db 가 `healthy`, backup 이 `Up`
- [ ] `docker compose ps` 의 PORTS 칸에서 **db 에는 `0.0.0.0:...->` 가 없음** (DB 포트 미노출). 웹만 `0.0.0.0:3000->3000/tcp`
- [ ] `Test-NetConnection localhost -Port 2375` → `TcpTestSucceeded : False` (Docker 데몬 TCP 꺼짐)
- [ ] `Get-NetFirewallRule -DisplayName "Sugo web (LAN only)" | Get-NetFirewallAddressFilter` → `RemoteAddress : LocalSubnet`, 규칙 Profile 이 `Private`
- [ ] `Get-NetConnectionProfile` → 집 네트워크가 `Private`
- [ ] Docker 관련 방화벽 규칙에 `Public`/`Any` 허용 없음 ([deploy-windows.md 4번](deploy-windows.md#docker-가-만든-방화벽-규칙-점검))
- [ ] 공유기 관리 페이지: 3000 포트포워딩 없음, **UPnP 꺼짐** 권장
- [ ] `.env` 가 git 에 안 잡힘: `git status` 에 `.env` 없음
- [ ] `docker compose exec web id -u` → `1000`, `docker compose exec db id -u` → `70`
- [ ] 부모 PIN 만들었음 (태블릿 → ⚙️ 부모 설정)
- [ ] 하루 뒤 `backups\` 에 `sugo-*.dump` 가 생김, `deploy\restore-test.ps1` 성공
- [ ] 휴대폰을 **모바일 데이터(LTE/5G)** 로 바꾼 뒤 `http://<집 공인 IP>:3000` 접속이 **안 되는 것** 확인

