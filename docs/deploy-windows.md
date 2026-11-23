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
> 카페/회사 같은 바깥 네트워크는 계속 "공용"으로 두세요. 그러면 Sugo 포트가 자동으로 막힙니다.

## 3. Git 설치 + Sugo 받기

1. https://git-scm.com/download/win 에서 Git 을 설치합니다 (기본값으로 다음 → 다음).
2. PowerShell:
   ```powershell
   git clone https://github.com/jeongyounghoon-star/Sugo.git C:\sugo
   cd C:\sugo
   ```

> 처음 설치 전에 GitHub 에서 **Actions → "Docker image"** 가 한 번 성공했는지 확인하세요 (main 에 머지되면 자동 실행).
> 그리고 **GitHub → 내 프로필 → Packages → sugo → Package settings → Change visibility → Public** 으로 바꿉니다.
> (이미지에는 비밀값이 없습니다. Private 로 두려면 PC에서 `docker login ghcr.io` 에 `read:packages` 권한 토큰이 필요합니다.)

## 4. 설치 스크립트 실행

**관리자 권한**으로 PowerShell 을 엽니다 (시작 메뉴에서 PowerShell 우클릭 → 관리자 권한으로 실행).

```powershell
cd C:\sugo
powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1
```

스크립트가 하는 일:
1. Docker 가 켜져 있는지 확인
2. `.env` 파일을 만들고 **강한 랜덤 DB 비밀번호**(64자)를 넣음. 이 파일은 지금 사용자만 읽을 수 있게 권한을 제한하고, 화면에 비밀번호를 출력하지 않습니다.
3. `backups\`, `logs\` 폴더 만들기
4. 방화벽 규칙 **"Sugo web (LAN only)"**: TCP 3000, 개인 프로필, 로컬 서브넷만 허용
5. 이미지를 받아서 실행 (`docker compose up -d`)
6. 작업 스케줄러에 **"Sugo auto update"** 등록 (10분마다 새 버전 확인)

끝나면 `태블릿에서 열기: http://192.168.x.x:3000` 이 보입니다.

상태 확인:
```powershell
docker compose ps          # web, db, backup 이 Up (healthy) 이면 정상
docker compose logs web    # 웹 로그
```

### 방화벽 규칙을 직접 만들고 싶다면

```powershell
New-NetFirewallRule -DisplayName "Sugo web (LAN only)" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
```

### Docker 가 만든 방화벽 규칙 점검

Docker Desktop 이 처음 포트를 열 때 "액세스 허용" 창이 뜨면 **개인 네트워크만** 체크하세요.
이미 공용까지 허용했는지 확인하려면:
```powershell
Get-NetFirewallRule -Direction Inbound -Enabled True |
  Where-Object { $_.DisplayName -match "Docker|com.docker|vpnkit" } |
  Select-Object DisplayName, Profile, Action
```
`Profile` 에 `Public` 이나 `Any` 가 있는 허용 규칙은 끄는 것을 권장합니다:
```powershell
Get-NetFirewallRule -DisplayName "<위에서 본 이름>" | Set-NetFirewallRule -Profile Private
```

## 5. PC 의 IP 주소 확인 + 고정

```powershell
ipconfig
```
`IPv4 주소 . . . : 192.168.0.23` 같은 줄이 PC 주소입니다 (`vEthernet (WSL)` 항목은 무시).

공유기가 재부팅될 때 주소가 바뀌지 않게, 공유기 관리 페이지에서 **DHCP 고정 할당(주소 예약)** 으로 이 PC에 지금 주소를 고정해 두면 편합니다.

## 6. 태블릿에서 접속

1. 태블릿을 집 Wi-Fi 에 연결합니다.
2. 브라우저(Safari/Chrome)에서 `http://192.168.0.23:3000` (5번에서 본 주소) 을 엽니다.
3. **⚙️ 부모 설정** 을 눌러 **부모 PIN(숫자 4~6자리)** 을 바로 만드세요. (PIN 이 있어야 프로필 삭제/초기화/이름 변경이 됩니다. 아이에게 알려주지 마세요.)
4. **한글 모험** → 펫을 고르고 아이 **별명** 을 적어 프로필을 만듭니다. 아이가 여러 명이면 각자 만듭니다.

### 홈 화면에 추가 (앱처럼 쓰기)

- **iPad (Safari)**: 공유 버튼 □↑ → **홈 화면에 추가**
- **Android (Chrome)**: 오른쪽 위 ⋮ → **홈 화면에 추가**

가로/세로 모두 됩니다.

> 참고: 집 안에서는 `http://` 로 접속하므로 브라우저가 "보안 컨텍스트"로 보지 않아 **오프라인 캐시(서비스 워커)** 는 켜지지 않습니다.
> 대신 진도는 태블릿 브라우저에 먼저 저장되고, 서버(PC)가 꺼져 있다가 다시 켜지면 자동으로 동기화됩니다.

## 7. 자동 업데이트

- GitHub 의 main 에 머지 → CI 통과 → **Actions 가 새 이미지를 GHCR 에 올림** → PC의 작업 스케줄러가 10분 안에 받아서 재시작합니다.
- 기록: `C:\sugo\logs\update.log`
- 작업 스케줄러는 **로그인한 사용자 세션**에서 돕니다 (Docker Desktop 도 마찬가지). PC를 재부팅하면 로그인해 두세요.
- 자동 업데이트는 **이미지만** 바꿉니다. `docker-compose.yml` 이나 `deploy\` 스크립트가 바뀐 릴리스는 직접:
  ```powershell
  cd C:\sugo
  git pull
  powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1
  ```
- 바로 업데이트하고 싶으면: `powershell -ExecutionPolicy Bypass -File .\deploy\update.ps1`

## 8. 백업과 복구

- 매일 자동으로 `C:\sugo\backups\sugo-YYYYmmdd-HHMMSS.dump` 가 생기고, **최근 14개**만 남습니다 (컨테이너가 시작될 때도 한 번).
- 이 폴더를 가끔 USB/클라우드에 복사해 두면 PC 고장에도 안전합니다.

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
docker compose stop web
docker compose exec -T backup pg_restore --clean --if-exists --no-owner -d sugo /backups/sugo-20261123-210000.dump
docker compose start web
```

## 9. 자주 쓰는 명령

```powershell
cd C:\sugo
docker compose ps                 # 상태
docker compose logs -f web        # 웹 로그 보기 (Ctrl+C 로 나가기)
docker compose restart web        # 웹 재시작
docker compose down               # 모두 멈춤 (데이터는 남음)
docker compose up -d              # 다시 시작
```

## 10. 문제 해결

| 증상 | 확인 |
| --- | --- |
| 태블릿에서 접속이 안 됨 | 같은 Wi-Fi 인지 / 2번 네트워크가 "개인" 인지 / `Get-NetFirewallRule -DisplayName "Sugo web (LAN only)"` / `docker compose ps` 가 healthy 인지 |
| PC 에서는 `http://localhost:3000` 이 되는데 태블릿만 안 됨 | 방화벽(4번), 네트워크 프로필(2번), 공유기의 "AP 격리/게스트 Wi-Fi" 기능 끄기 |
| `pull` 실패 | 인터넷 연결, GHCR 패키지가 Public 인지 (3번) |
| 화면이 옛날 버전 | `logs\update.log` 확인, `.\deploy\update.ps1` 직접 실행 |
| PIN 을 5번 틀려 잠김 | 10분 기다리기 |
| PIN 을 잊어버림 | PC 에서: `docker compose exec -T db psql -U sugo -d sugo -c "delete from settings where key='parent_pin'"` 후 부모 설정에서 새로 만들기 |

설치 후에는 [security.md 의 점검 체크리스트](security.md#설치-후-점검-체크리스트)를 한 번 확인하세요.
