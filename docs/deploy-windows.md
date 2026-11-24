# 집 Windows PC에 Sugo 설치하기 (Docker 초보용)

집에 항상 켜져 있는 Windows PC에서 Sugo를 돌리고, **같은 집 Wi-Fi에 있는 태블릿에서만** 접속하는 방법입니다.
인터넷(집 밖)에는 공개하지 않습니다. 보안 설계와 이유는 [security.md](security.md)에 있습니다.

```
태블릿 ──(집 Wi-Fi)──▶ PC:3000 [web] ──(내부망)──▶ [db: Postgres]
                                         └──────▶ [backup: 매일 백업 → C:\sugo\backups]
```

걸리는 시간: 처음이면 30~40분.

---

## 0. 준비물

- Windows 10/11 PC (항상 켜 두고, 절전 모드에서 잠들지 않게)
- 관리자 권한 계정
- 인터넷 연결 (설치와 자동 업데이트에 필요)
- 태블릿이 PC와 **같은 공유기(Wi-Fi)** 에 연결되어 있을 것

> ⚠️ **하지 말 것**: 공유기에서 포트포워딩을 만들거나 UPnP로 3000번 포트를 여는 것. Sugo는 집 안에서만 쓰도록 만들어졌습니다.

## 1. Docker Desktop 설치

1. https://www.docker.com/products/docker-desktop/ 에서 **Docker Desktop for Windows** 를 받아 설치합니다.
   설치 중 "Use WSL 2" 를 켠 상태로 둡니다. 설치가 끝나면 PC를 다시 시작하라고 하면 다시 시작합니다.
2. Docker Desktop 을 실행하고 약관에 동의합니다. (로그인은 안 해도 됩니다.)
3. 오른쪽 위 ⚙️ **Settings** 에서:
   - **General → Start Docker Desktop when you sign in to your computer**: ✅ 켜기
   - **General → Expose daemon on tcp://localhost:2375 without TLS**: ⬜ **반드시 꺼져 있어야 합니다** (켜져 있으면 누구나 PC의 Docker를 조종할 수 있음)
4. PowerShell 을 열어 확인합니다:
   ```powershell
   docker version
   docker compose version
   ```
   두 명령 모두 버전이 나오면 성공.

## 2. 네트워크를 "개인(Private)"으로 설정

Windows 방화벽 규칙을 **개인 네트워크에서만** 허용하기 때문에, 집 네트워크가 "공용"으로 되어 있으면 태블릿에서 접속이 안 됩니다.

- **설정 → 네트워크 및 인터넷 → (Wi-Fi 또는 이더넷) → 연결된 네트워크 속성 → 네트워크 프로필 유형: 개인 네트워크**

또는 관리자 PowerShell:
```powershell
Get-NetConnectionProfile                      # 지금 상태 보기 (NetworkCategory)
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private   # 이름은 위에서 본 InterfaceAlias
```
> 카페/회사 같은 바깥 네트워크는 계속 "공용"으로 두세요. setup.ps1 이 만드는 **차단 규칙** 때문에 공용 네트워크에서는 Sugo 포트가 막힙니다 (Docker 가 따로 허용 규칙을 만들어 두었더라도).

## 3. Git 설치 + Sugo 받기

1. https://git-scm.com/download/win 에서 Git 을 설치합니다 (기본값으로 다음 → 다음).
2. PowerShell:
   ```powershell
   git clone https://github.com/jeongyounghoon-star/Sugo.git C:\sugo
   cd C:\sugo
   ```

> 처음 설치 전에 GitHub 에서 **Actions → "Docker image"** 가 한 번 성공했는지 확인하세요 (main 에 머지되면 자동 실행).
> 이 워크플로가 이미지를 **서명**하고, PC 는 서명이 확인된 이미지만 실행합니다. 실패했으면 PC 에서는 설치가 진행되지 않습니다.
> 그리고 **GitHub → 내 프로필 → Packages → sugo → Package settings → Change visibility → Public** 으로 바꿉니다.
> (이미지에는 비밀값이 없습니다. 서명 확인 도구가 로그인 없이 이미지를 읽어야 하므로 Public 이 필요합니다.)

## 4. 설치 스크립트 실행

**평소 로그인하는 그 계정으로** PowerShell 을 **관리자 권한**으로 엽니다 (시작 메뉴에서 PowerShell 우클릭 → 관리자 권한으로 실행).
다른 관리자 계정의 비밀번호를 넣어서 여는 것은 안 됩니다: 자동 업데이트와 Docker Desktop 은 로그인한 계정에서 돌기 때문입니다 (스크립트가 확인하고 멈춥니다).

```powershell
cd C:\sugo
powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1
```

이미 설치한 PC에서 다시 실행해도 기존 `.env`(DB 비밀번호, `PIN_PEPPER`, `SETUP_CODE`)는 유지됩니다. 완전히 새 설치를 시작하기 전에만 `-OverwriteEnv`로 재생성할 수 있습니다. **운영 DB가 생긴 뒤에는 사용하지 마세요.** DB 비밀번호가 달라지고 기존 PIN 해시도 새 페퍼와 맞지 않게 됩니다.

스크립트가 하는 일:
1. Docker 가 켜져 있는지, 로그인한 계정으로 실행했는지 확인
2. `C:\sugo` 폴더 권한을 **이 사용자 + SYSTEM + Administrators** 만으로 제한 (같은 PC 의 다른 계정이 스크립트/백업을 바꾸거나 읽지 못하게)
3. `.env` 파일을 만들고 **강한 랜덤 DB 비밀번호**(64자), PIN 보호용 비밀값(`PIN_PEPPER`), **설치 코드**(8자리)를 넣음. 이 파일은 지금 사용자만 읽을 수 있게 권한을 제한하고, 비밀번호는 화면에 출력하지 않습니다.
4. `backups\`, `logs\` 폴더 만들기
5. 방화벽 규칙 3개:
   - **"Sugo web (LAN only)"**: TCP 3000, 개인 프로필, 로컬 서브넷만 **허용**
   - **"Sugo web block (public/domain networks)"**: 공용/도메인 네트워크에서 3000 **차단**
   - **"Sugo web block (non-LAN addresses)"**: 집 밖 주소(공인 IP, IPv6 전역 주소, `100.64.0.0/10`)에서 3000 **차단**
   - 그리고 Docker 가 만든 방화벽 규칙을 표로 보여 줍니다 (아래 "Docker 가 만든 방화벽 규칙 점검")
6. 이미지의 **서명을 확인**한 뒤 그 이미지(digest)로 실행 (`deploy\update.ps1 -Initial`)
7. 작업 스케줄러에 **"Sugo auto update"** 등록 (10분마다 새 버전 확인)

끝나면 이렇게 보입니다:
```
태블릿에서 열기: http://192.168.x.x:3000
처음 접속하면 '부모 설정'에서 부모 PIN(숫자 6자리 이상)을 바로 만들어 주세요.
그때 필요한 설치 코드: 12345678
```
**설치 코드를 적어 두세요** (6번에서 씁니다). 나중에 다시 보려면 `C:\sugo\.env` 의 `SETUP_CODE` 줄.

### Tailscale로 접속할 때만

기본 설정은 Tailscale이 쓰는 `100.64.0.0/10`도 LAN 밖으로 보고 차단합니다. Tailscale 피어에서 Sugo에 접속할 계획이면 명시적으로 다음처럼 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1 -AllowTailscale
```

이 옵션은 `100.64.0.0/10`만 추가 허용합니다. 공용 인터넷, 다른 공인 IPv4, 전역 IPv6는 계속 차단되며 포트포워딩이나 UPnP를 켜서는 안 됩니다. Tailscale을 더 이상 쓰지 않으면 옵션 없이 setup.ps1을 다시 실행해 허용 규칙을 제거하세요.

상태 확인:
```powershell
docker compose ps          # web, db, backup 이 Up (healthy) 이면 정상
docker compose logs web    # 웹 로그
```

### 방화벽 규칙을 직접 만들고 싶다면 (관리자 PowerShell)

```powershell
New-NetFirewallRule -DisplayName "Sugo web (LAN only)" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
# 차단은 허용보다 우선합니다: Docker 프로그램 허용 규칙이 있어도 아래 경우는 막힘
New-NetFirewallRule -DisplayName "Sugo web block (public/domain networks)" -Direction Inbound -Action Block `
  -Protocol TCP -LocalPort 3000 -Profile Public,Domain
New-NetFirewallRule -DisplayName "Sugo web block (non-LAN addresses)" -Direction Inbound -Action Block `
  -Protocol TCP -LocalPort 3000 -Profile Any -RemoteAddress @(
    "0.0.0.0-9.255.255.255","11.0.0.0-126.255.255.255",
    "128.0.0.0-169.253.255.255","169.255.0.0-172.15.255.255","172.32.0.0-192.167.255.255",
    "192.169.0.0-223.255.255.255","2000::/3")
```

### Docker 가 만든 방화벽 규칙 점검

Docker Desktop 이 처음 포트를 열 때 "액세스 허용" 창이 뜨면 **개인 네트워크만** 체크하세요.
Windows 방화벽의 허용 규칙은 "하나라도 맞으면 허용"이라서, Docker 가 **프로그램 단위 허용 규칙**(모든 주소, 공용 포함)을 만들어 두면 Sugo 의 "LAN only" 허용 규칙만으로는 제한이 안 됩니다. 그래서 setup.ps1 이 **차단 규칙**을 함께 만들고, Docker 규칙을 표로 보여 줍니다. 직접 확인하려면:
```powershell
Get-NetFirewallApplicationFilter | Where-Object Program -match 'docker|vpnkit|wsl' | Get-NetFirewallRule |
  Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' } |
  Select-Object DisplayName, Profile, Action
```
- `Action=Allow` 인데 `Profile` 에 `Public`/`Domain`/`Any` 가 있으면: 개인 네트워크 + 로컬 서브넷으로 좁히기
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1 -FixDockerRules
  ```
- `Action=Block` 규칙이 있으면 ("액세스 허용" 창에서 취소를 누른 경우) 태블릿 접속이 안 됩니다. **방화벽 전체를 끄지 말고** 그 규칙만 지우세요:
  ```powershell
  Remove-NetFirewallRule -DisplayName "<위에서 본 이름>"
  ```
- 확인: `Get-NetFirewallRule -DisplayName "Sugo web*" | Select-Object DisplayName, Action, Profile` → 허용 1개 + 차단 2개
- IPv6 로 열리지 않았는지: `netstat -ano | findstr :3000` 에 `[::]:3000` 이 **없어야** 합니다 (`0.0.0.0:3000` 만)

## 5. PC 의 IP 주소 확인 + 고정

```powershell
ipconfig
```
`IPv4 주소 . . . : 192.168.0.23` 같은 줄이 PC 주소입니다 (`vEthernet (WSL)` 항목은 무시).

공유기가 재부팅될 때 주소가 바뀌지 않게, 공유기 관리 페이지에서 **DHCP 고정 할당(주소 예약)** 으로 이 PC에 지금 주소를 고정해 두면 편합니다.

## 6. 태블릿에서 접속

1. 태블릿을 집 Wi-Fi 에 연결합니다.
2. 브라우저(Safari/Chrome)에서 `http://192.168.0.23:3000` (5번에서 본 주소) 을 엽니다.
3. **⚙️ 부모 설정** 을 눌러 **설치 코드**(4번 끝에 나온 8자리)와 **부모 PIN(숫자 6~10자리)** 을 넣어 바로 만드세요. (PIN 이 있어야 프로필 삭제/초기화/이름 변경이 됩니다. 아이에게 알려주지 마세요. 생일·전화번호 끝자리처럼 짐작하기 쉬운 숫자는 피하세요.)
4. **한글 모험** → 펫을 고르고 아이 **별명** 을 적어 프로필을 만듭니다. 아이가 여러 명이면 각자 만듭니다.

### 홈 화면에 추가 (앱처럼 쓰기)

- **iPad (Safari)**: 공유 버튼 □↑ → **홈 화면에 추가**
- **Android (Chrome)**: 오른쪽 위 ⋮ → **홈 화면에 추가**

가로/세로 모두 됩니다.

> 참고: 집 안에서는 `http://` 로 접속하므로 브라우저가 "보안 컨텍스트"로 보지 않아 **오프라인 캐시(서비스 워커)** 는 켜지지 않습니다.
> 대신 진도는 태블릿 브라우저에 먼저 저장되고, 서버(PC)가 꺼져 있다가 다시 켜지면 자동으로 동기화됩니다.

## 7. 자동 업데이트

- GitHub 의 main 에 머지 → CI 통과 → **Actions 가 새 이미지를 GHCR 에 올리고 서명** → PC의 작업 스케줄러가 10분 안에:
  1. 새 이미지의 **서명을 확인** (main 의 `docker.yml` 워크플로가 서명한 것만 통과)
  2. **업데이트 직전 백업** (`backups\sugo-pre-*.dump`)
  3. 확인한 digest 를 `.env` 의 `SUGO_IMAGE` 에 고정하고 재시작
  4. 4분 안에 정상(healthy)이 안 되면 이전 버전으로 되돌림
- 기록: `C:\sugo\logs\update.log`
  - `verified ...` / `updated web image ...`: 정상 업데이트
  - `no change`: 새 버전 없음
  - **`REFUSED ... signature verification failed`**: 서명이 맞지 않아 **바꾸지 않았음** (지금 버전이 계속 돕니다). 반복되면 GitHub 의 "Docker image" 워크플로를 확인하세요.
  - **`WARNING: stale maintenance.lock ... removing it`**: 복구 창 종료/PC 전원 차단 등으로 6시간 넘게 남은 잠금을 정리하고 업데이트를 재개함
- 작업 스케줄러는 **로그인한 사용자 세션**에서 돕니다 (Docker Desktop 도 마찬가지). PC를 재부팅하면 로그인해 두세요.
- 자동 업데이트는 **이미지만** 바꿉니다. `docker-compose.yml` 이나 `deploy\` 스크립트가 바뀐 릴리스는 직접:
  ```powershell
  cd C:\sugo
  git pull
  powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1
  ```
- 바로 업데이트하고 싶으면: `powershell -ExecutionPolicy Bypass -File .\deploy\update.ps1`

## 8. 백업과 복구

- 매일 자동으로 `C:\sugo\backups\sugo-YYYYmmdd-HHMMSS.dump` 가 **하루 1개** 생기고, **최근 14개**만 남습니다.
- 업데이트/복구 직전에는 `sugo-pre-YYYYmmdd-HHMMSS.dump` 가 생기고 최근 5개만 남습니다.
- 이 폴더를 가끔 USB/클라우드에 복사해 두면 PC 고장에도 안전합니다. `.env` 도 반드시 백업하되 DB dump와는 **따로 암호화된 USB/비밀 저장소에** 보관하세요. `.env`가 없으면 `PIN_PEPPER`가 달라져 복구한 DB의 기존 부모 PIN을 확인할 수 없고, 아래 PIN 재설정 절차가 필요합니다.

### 복구 테스트 (운영 DB는 건드리지 않음, 한 달에 한 번 권장)

```powershell
cd C:\sugo
powershell -ExecutionPolicy Bypass -File .\deploy\restore-test.ps1
# 특정 파일: ... -File sugo-20261123-210000.dump
```
임시 DB 에 복구해 보고 `profiles=2` 같은 행 수를 보여준 뒤 지웁니다. `OK: 복구 테스트 성공` 이 나오면 됩니다.

### 실제 복구 (데이터가 망가졌을 때)

```powershell
cd C:\sugo
powershell -ExecutionPolicy Bypass -File .\deploy\restore.ps1 -File sugo-20261123-210000.dump
```
스크립트가 하는 일: ① 시각과 PID가 기록된 `maintenance.lock` 을 만들어 **자동 업데이트를 멈춤** (진행 중인 업데이트는 끝날 때까지 기다림) → ② 지금 DB 를 한 번 더 백업 (`sugo-pre-*.dump`, 복구가 잘못돼도 되돌릴 수 있게) → ③ web 을 멈추고 `pg_restore --clean --if-exists --single-transaction --exit-on-error` (한 트랜잭션이라 중간에 실패하면 **DB 는 복구 전 그대로**) → ④ web 다시 시작, 잠금 해제. 비정상 종료로 잠금이 남아도 6시간 뒤 update.ps1이 경고 로그를 남기고 정리합니다.

## 9. 자주 쓰는 명령

```powershell
cd C:\sugo
docker compose ps                 # 상태
docker compose logs -f web        # 웹 로그 보기 (Ctrl+C 로 나가기)
docker compose restart web        # 웹 재시작
docker compose down               # 모두 멈춤 (데이터는 남음)
docker compose up -d              # 다시 시작 (.env 에 고정된, 서명 확인된 이미지로)
```

## 10. 문제 해결

| 증상 | 확인 |
| --- | --- |
| 태블릿에서 접속이 안 됨 | 같은 Wi-Fi 인지 / 2번 네트워크가 "개인" 인지 / `Get-NetFirewallRule -DisplayName "Sugo web (LAN only)"` / `docker compose ps` 가 healthy 인지 |
| PC 에서는 `http://localhost:3000` 이 되는데 태블릿만 안 됨 | 방화벽(4번, Docker 차단 규칙), 네트워크 프로필(2번), 태블릿이 **메인 Wi-Fi** 에 붙어 있는지 (게스트 Wi-Fi 면 메인으로 옮기기. **게스트 Wi-Fi 의 격리는 끄지 마세요**: 손님 폰·IoT 기기는 오히려 게스트 Wi-Fi 에 두는 것을 권장) |
| 설치 중 "이미지를 확인/실행하지 못했습니다" | `logs\update.log` 확인: 인터넷 연결, GHCR 패키지가 Public 인지 (3번), GitHub 의 "Docker image" 워크플로가 성공했는지 |
| 화면이 옛날 버전 | `logs\update.log` 확인 (`REFUSED` 면 서명 문제라 일부러 안 바꾼 것), `.\deploy\update.ps1` 직접 실행 |
| setup.ps1 이 "POSTGRES_PASSWORD 가 … 예시 값" 이라며 멈춤 | `.env.example` 을 복사해서 생긴 `.env` 입니다. 아직 설치 전이면 `.env` 를 지우고 다시 실행 |
| PIN 을 5번 틀려 잠김 | 기다리기 (10분 → 30분 → 2시간 → … 틀릴수록 길어짐). 급하면 PC 에서: `docker compose exec -T db psql -U sugo -d sugo -c "delete from settings where key='parent_pin_lock'"` |
| PIN 을 잊어버림 | PC 에서: `docker compose exec -T db psql -U sugo -d sugo -c "delete from settings where key in ('parent_pin','parent_pin_lock')"` 후 부모 설정에서 설치 코드(`.env` 의 `SETUP_CODE`)로 새로 만들기 |

설치 후에는 [security.md 의 점검 체크리스트](security.md#설치-후-점검-체크리스트)를 한 번 확인하세요.
