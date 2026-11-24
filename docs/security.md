# Sugo 보안 설계

집 Windows PC 에서 **집 LAN 전용**으로 돌리는 가족용 앱입니다. 지키려는 것과 막으려는 것:

- **지킬 것**: 아이 별명/학습 기록, 집 PC 자체 (Docker 를 통한 PC 장악 방지), DB 비밀번호
- **막을 것**: 인터넷에서의 접근, 같은 Wi-Fi 의 다른 기기/웹사이트를 통한 장난(CSRF, DNS 리바인딩), 아이의 실수로 인한 데이터 삭제, 공급망(의존성/액션) 공격, 비밀값 유출

## 1. 네트워크

| 조치 | 이유 |
| --- | --- |
| 공유기 **포트포워딩/UPnP 금지** (문서로 명시) | 인터넷에 열리는 순간 위협 모델이 완전히 달라짐 (HTTPS/로그인 없음) |
| **web 포트(3000)만** 호스트에 노출 | 공격 표면 최소화 |
| Windows 방화벽 허용: **개인(Private) 프로필 + LocalSubnet** 에서만 | 집 LAN 에서 태블릿 접속 |
| Windows 방화벽 **차단 규칙 2개**: ① 공용/도메인 프로필에서 3000 차단 ② LAN 밖 주소(공인 IPv4 전체, IPv6 전역 `2000::/3`)에서 3000 차단 | 허용 규칙은 OR 로 합쳐지므로, Docker Desktop 이 만든 **프로그램 단위 허용 규칙**(모든 주소/공용 프로필)이 있으면 위 허용 규칙만으로는 아무것도 제한하지 못함. 차단은 허용보다 우선하므로 프로그램 규칙과 상관없이 막힘 |
| `setup.ps1` 이 Docker/WSL 관련 인바운드 규칙을 **점검해서 표로 보여 주고** 공용/모든 주소 허용이면 경고 (`-FixDockerRules` 로 개인+로컬 서브넷으로 좁힘) | Docker 의 다른 포트도 집 밖에 열리지 않게 |
| 게스트 Wi-Fi 의 **AP 격리는 유지** (손님 폰·IoT 는 게스트 Wi-Fi 에, 태블릿과 PC 는 메인 Wi-Fi 에) | 위협 모델상 믿지 않는 기기가 PC:3000 (그리고 PC 의 다른 서비스)에 닿지 않게. 문서에서 "격리 끄기" 안내를 없앰 |
| **Postgres 호스트 포트 없음**, `backend` 네트워크는 `internal: true` | DB 는 web/backup 컨테이너에서만 접근, DB 컨테이너는 인터넷으로도 못 나감 |
| backup 서비스도 `backend` 내부망만 | 같은 이유 |
| Docker 데몬 TCP(2375) **노출 금지** 확인 | 켜져 있으면 LAN 누구나 PC 에 root 권한 컨테이너를 띄울 수 있음 |
| `WEB_BIND` 로 특정 LAN IP 에만 바인드 가능 (기본 `0.0.0.0` = IPv4 만, `[::]` 로 열지 않음) | PC 에 네트워크 카드가 여러 개일 때 범위 축소, ISP 가 IPv6 를 주는 집에서 전역 IPv6 로 노출되지 않게 |

## 2. 자동 배포

| 조치 | 이유 |
| --- | --- |
| Watchtower 등 **docker.sock 마운트 컨테이너 사용 안 함** | docker.sock = 호스트 root 권한. 그 컨테이너가 뚫리면 PC 전체가 넘어감 |
| 대신 **Windows 작업 스케줄러**가 10분마다 `deploy/update.ps1` | 호스트 권한은 호스트 스크립트에만 |
| 이미지는 **Sigstore keyless 서명** (`docker.yml`, OIDC `id-token: write` 는 그 job 에만). `update.ps1` 은 `:latest` 의 digest 를 확인한 뒤 **cosign 으로 "main 의 `.github/workflows/docker.yml` 이 서명했는지"** 검증하고, 통과한 digest 만 `.env` 의 `SUGO_IMAGE=ghcr.io/...@sha256:...` 로 **고정**해서 실행 | main 에 잘못된 코드가 들어가거나 GHCR 토큰/태그가 바꿔치기돼도, 그 워크플로가 main 에서 서명하지 않은 이미지는 PC 에서 실행되지 않음 (PR, 다른 브랜치, 다른 워크플로, 개인 PC 에서 만든 이미지는 모두 거부) |
| 검증 실패 시 **기존 컨테이너 그대로**, `logs\update.log` 에 `REFUSED` | 실패해도 서비스는 계속 |
| cosign 은 **digest 고정 컨테이너**(`ghcr.io/sigstore/cosign/cosign:v3.1.4@sha256:…`, read-only, cap drop, docker.sock 없음)로 실행 | PC 에 설치할 것 없음, 검증 도구 자체도 고정 |
| `docker.yml`: digest 로 푸시 → 서명 → **PC 와 같은 코드(`deploy/lib.ps1`)로 검증** → 그 뒤에만 `:latest` 이동 → 다시 PC 방식으로 latest 확인 | 서명 안 된 digest 를 latest 가 가리키는 순간이 없음 |
| 업데이트 직전 **자동 백업** (`backups\sugo-pre-*.dump`, 5개 보관). 백업 실패 시 업데이트 안 함 | 새 이미지의 마이그레이션이 데이터를 망가뜨려도 직전 상태로 복구 가능 |
| 새 이미지가 4분 안에 healthy 가 안 되면 **이전 digest 로 자동 롤백** | |
| `maintenance.lock` + 배포 뮤텍스: 복구(`restore.ps1`) 중에는 자동 업데이트가 아무것도 안 함 | 복구 중 web 이 다시 켜지며 마이그레이션이 `pg_restore` 와 겹치는 것 방지 |
| CI `deploy-scripts` job 이 **실제 update.ps1/restore.ps1** 을 돌려 확인: 서명 없는 이미지 거부, **다른 워크플로가 서명한 이미지 거부**, 서명된 이미지 digest 고정, 업데이트 전 백업, 잠금 중 업데이트 안 함, 복구 | |
| 자동 업데이트는 **이미지만** (compose/스크립트는 `git pull` 로 수동) | 원격 변경이 집 PC 에서 자동 실행되는 범위를 이미지 안으로 제한 |
| 이미지 빌드/푸시는 **main 에서 CI 가 통과한 커밋만** (`workflow_run`, head_branch/repo 확인) | PR/포크 코드가 이미지로 나가지 않게 |
| 워크플로 `permissions: {}` 기본, job 별 최소 권한 (`contents: read`, 푸시 job 만 `packages: write` + `id-token: write`) | 토큰 탈취 시 피해 최소화 |
| **main 브랜치 보호** (PR 필수, 필수 체크 3개, 강제 푸시/삭제 금지): 2026-11-24 적용됨 | main 커밋 = 집 PC 배포이므로 리뷰 없는 직접 푸시를 막음 |
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

- 비밀값(DB 비밀번호, `PIN_PEPPER`, `SETUP_CODE`)은 `.env` 에만. `.gitignore`/`.dockerignore` 에 포함, **커밋 금지**.
- `deploy/setup.ps1` 이 `RandomNumberGenerator` 로 **32바이트(64자 hex) DB 비밀번호와 PIN_PEPPER**, 8자리 설치 코드를 만들고, `.env` 권한을 현재 사용자/SYSTEM/Administrators 로 제한 (`icacls` 실패하면 설치 중단). DB 비밀번호와 페퍼는 화면에 출력하지 않음.
- `.env` 가 이미 있으면 값을 검사: DB 비밀번호가 비었거나 `.env.example` 자리표시자거나 32자 미만이면 **설치 중단** (`.env.example` 을 그대로 복사한 경우 방지).
- **설치 폴더 전체**(`C:\sugo`) 권한도 상속을 끊고 설치 사용자/SYSTEM/Administrators 만. `C:\` 기본 권한은 "인증된 사용자: 수정" 이라 그대로 두면 같은 PC 의 다른 표준 계정이 10분마다 부모 계정으로 실행되는 `update.ps1` 을 고치거나 백업 파일을 가져갈 수 있음.
- `setup.ps1` 은 화면에 로그인한 그 계정으로 실행해야 함 (다른 관리자 계정이면 중단): 작업 스케줄러와 `.env` 권한이 Docker Desktop 이 도는 계정과 어긋나지 않게.
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
| **부모 PIN** (숫자 **6~10자리**, `scrypt(HMAC(PIN_PEPPER, PIN))` + salt 로 저장) | `lib/server/pin.ts` |
| PIN 잠금: 실패 횟수/잠금 상태를 **DB 에 저장**하고, **검증 전에** 트랜잭션 + `SELECT … FOR UPDATE` 로 시도를 먼저 기록. 5번째 시도에서 미리 잠금 → 동시에 수백 개를 보내도 잠금 단계마다 **정확히 5번만** 검증 (회귀 테스트). 잠금 시간 **10분 → 30분 → 2시간 → 6시간 → 24시간**, 재시작해도 유지 | `lib/server/pin.ts`, `tests/api.test.ts` |
| **설치 코드**: 처음 PIN 을 만들 때 `.env` 의 `SETUP_CODE` (setup.ps1 이 화면에 보여 줌) 가 필요. 같은 잠금 적용. 처음 PIN 은 원자적으로 한 번만 저장 | LAN 의 다른 기기가 설치 직후 먼저 PIN 을 정하는 것(TOFU) 방지 |
| 날짜 키는 **실제 날짜 + 오늘 근처**만, 플레이 기록은 프로필당 최근 5000개만 보관 | 쓰기 요청으로 디스크를 무한히 채우지 못하게 |
| Host 헤더는 `net.isIP` 로 엄격히 파싱 (콜론 여러 개 등 이상한 형식 거부) | `lib/server/http.ts` |
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
- 매일 `pg_dump` 백업 **하루 1개**, 최근 14개 보관 (컨테이너를 여러 번 다시 시작해도 하루 1개라 오래된 백업이 밀려나지 않음). 업데이트/복구 직전 백업은 따로 5개.
- backup 컨테이너는 web 에 의존하지 않음 (web 이 망가져도 백업 계속, 첫 백업은 테이블이 생길 때까지 기다림).
- **복구 테스트** `deploy/restore-test.ps1` (임시 DB 에 복구 → 행 수 확인 → 삭제), **실제 복구** `deploy/restore.ps1` (자동 업데이트 멈춤 → 복구 전 백업 → `pg_restore --single-transaction --exit-on-error` → 재시작).
- 백업 파일은 암호화되어 있지 않습니다. `backups\` 폴더를 외부로 복사할 때는 개인 저장소에만. PIN 해시가 들어 있지만 `PIN_PEPPER` 없이는 오프라인으로 풀 수 없음 (`.env` 는 백업과 따로 보관).

## 7. 알려진 한계 (의도적으로 받아들인 것)

- **LAN 안에서는 HTTP** (TLS 없음): 집 Wi-Fi 비밀번호를 아는 다른 기기가 트래픽을 엿볼 수 있음. 오가는 것은 별명과 학습 기록, 그리고 **부모 화면에서 변경할 때마다 PIN** (부모 화면이 PIN 을 들고 있다가 요청마다 보냄). 손님 기기는 게스트 Wi-Fi 에 두는 것으로 완화. 근본 해결은 내부 HTTPS(mkcert/사설 CA) 또는 짧은 세션 토큰 (나중 과제). HTTP 라서 서비스 워커/설치 프롬프트도 꺼집니다.
- **아이 쪽에는 로그인이 없음**: 같은 LAN 의 누구나 프로필 목록과 진도를 볼 수 있고, 진도를 올릴 수 있음(별 3개로 잠금 해제 등, 깎을 수는 없음), 프로필을 만들 수 있음 (최대 10개). 삭제/초기화는 PIN 필요.
- rate limit 과 PIN 잠금은 **기기 구분 없이 전체 기준** (IP 헤더는 위조 가능해서). LAN 안 누군가가 일부러 계속 틀리면 부모도 잠김(최대 24시간), 쓰기 요청을 쏟아내면 아이들 동기화가 잠시 429. 브라우저에 먼저 저장되므로 기록은 사라지지 않음. 급하면 PC 에서 잠금 해제: `docker compose exec -T db psql -U sugo -d sugo -c "delete from settings where key='parent_pin_lock'"`.
- **web 컨테이너는 LAN/인터넷으로 나갈 수 있음** (포트를 열어야 해서 `frontend` 를 internal 로 못 만듦). 런타임에 외부 통신은 필요 없지만, 이미지가 오염되면 통로가 될 수 있음 → 서명 검증(2장)으로 완화. 더 막으려면 Windows 쪽 아웃바운드 규칙 (나중 과제).

## 8. 레포 보안 설정 권장 (GitHub → Settings)

1. **Branches → Branch protection rule (`main`)**: ✅ 2026-11-24 적용
   - Require a pull request before merging (혼자 쓰는 저장소면 승인 수 0, PR 필수만은 꼭)
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
- [ ] Sugo 방화벽 규칙 3개 (허용 1 + 차단 2):
  ```powershell
  Get-NetFirewallRule -DisplayName "Sugo web*" | Select-Object DisplayName, Action, Profile, Enabled
  ```
  → `Sugo web (LAN only)` Allow/Private, `Sugo web block (public/domain networks)` Block/Domain, Public, `Sugo web block (non-LAN addresses)` Block/Any
- [ ] `Get-NetConnectionProfile` → 집 네트워크가 `Private`
- [ ] Docker 관련 방화벽 규칙 점검 ([deploy-windows.md 4번](deploy-windows.md#docker-가-만든-방화벽-규칙-점검)): 공용/모든 주소 허용이 있으면 `setup.ps1 -FixDockerRules`
- [ ] `netstat -ano | findstr :3000` → `0.0.0.0:3000` 만 있고 **`[::]:3000` 없음** (IPv6 로 안 열림)
- [ ] `Get-Content C:\sugo\logs\update.log -Tail 5` → `verified ghcr.io/...@sha256:...` 줄이 있음, `.env` 의 `SUGO_IMAGE` 가 `@sha256:` 로 끝남
- [ ] `icacls C:\sugo` → 설치 사용자, `NT AUTHORITY\SYSTEM`, `BUILTIN\Administrators` 만 (Users/Authenticated Users 없음)
- [ ] 공유기 관리 페이지: 3000 포트포워딩 없음, **UPnP 꺼짐** 권장
- [ ] `.env` 가 git 에 안 잡힘: `git status` 에 `.env` 없음
- [ ] `docker compose exec web id -u` → `1000`, `docker compose exec db id -u` → `70`
- [ ] 부모 PIN(6자리 이상) 만들었음 (태블릿 → ⚙️ 부모 설정, setup.ps1 이 보여 준 설치 코드 필요)
- [ ] `backups\` 에 `sugo-*.dump` 가 생김, `deploy\restore-test.ps1` 성공
- [ ] 태블릿과 PC 는 **메인 Wi-Fi**, 손님/IoT 기기는 게스트 Wi-Fi (격리 켠 채로)
- [ ] `scripts/smoke-test.sh` 는 **운영 PC 에서 돌리지 않음** (CI 전용, 빈 서버가 아니면 스스로 멈춤)
- [ ] 휴대폰을 **모바일 데이터(LTE/5G)** 로 바꾼 뒤 `http://<집 공인 IP>:3000` 접속이 **안 되는 것** 확인

