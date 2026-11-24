<#
.SYNOPSIS
  Sugo 처음 설치 (집 Windows PC, Docker Desktop). 평소 로그인하는 계정에서 "관리자 권한으로 실행"한 PowerShell 로.

.DESCRIPTION
  1. Docker 가 켜져 있는지, 평소 로그인한 그 계정으로 실행했는지 확인
  2. 설치 폴더 권한: 이 사용자 + SYSTEM + Administrators 만 (다른 로컬 계정이 스크립트/백업을 못 바꾸고 못 읽게)
  3. .env 준비: 강한 랜덤 DB 비밀번호, PIN_PEPPER, 설치 코드(SETUP_CODE). 이미 있으면 값을 검사하고 빠진 것만 추가
  4. 백업/로그 폴더
  5. Windows 방화벽: 웹 포트를 "개인(Private) 네트워크 + 로컬 서브넷"에서만 허용하고,
     공용/도메인 프로필과 LAN 밖 주소는 **차단 규칙**으로 막는다 (차단이 Docker 의 프로그램 허용 규칙보다 우선).
     Docker 가 만든 인바운드 규칙을 점검해서 보여 준다 (-FixDockerRules 면 개인+로컬 서브넷으로 좁힘)
  6. 서명을 확인한 이미지로 실행 (deploy/update.ps1 -Initial)
  7. 작업 스케줄러에 10분마다 자동 업데이트(deploy/update.ps1) 등록

  여러 번 실행해도 안전합니다 (.env 의 기존 값은 덮어쓰지 않음). 새 비밀값으로 재생성하려면
  아직 운영 DB가 없는 경우에만 -OverwriteEnv 를 명시적으로 사용합니다.

.EXAMPLE
  # 관리자 PowerShell 에서, 저장소 폴더(예: C:\sugo)에서:
  powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1
#>
[CmdletBinding()]
param(
  [int]$Port = 3000,
  [switch]$SkipFirewall,
  [switch]$SkipScheduledTask,
  [switch]$SkipFolderAcl,
  # 기존 .env 전체를 새 비밀값으로 재생성 (운영 DB가 있으면 DB 비밀번호가 달라지므로 사용 금지)
  [switch]$OverwriteEnv,
  # Tailscale 피어(100.64.0.0/10)에서만 추가 접근 허용. 공용 인터넷은 계속 차단.
  [switch]$AllowTailscale,
  # Docker 프로그램 허용 규칙을 개인 네트워크 + 로컬 서브넷으로 좁힌다
  [switch]$FixDockerRules,
  # 평소 로그인 계정이 아닌 다른 계정으로 실행하는 것을 허용 (권장하지 않음)
  [switch]$AllowOtherUser,
  [int]$UpdateEveryMinutes = 10
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot "lib.ps1")

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function New-RandomHex([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($b)
  $rng.Dispose()
  return -join ($b | ForEach-Object { $_.ToString("x2") })
}
function New-SetupCode {
  # 8자리 숫자, 치우침 없이 (rejection sampling)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $b = New-Object byte[] 4
  do { $rng.GetBytes($b); $n = [BitConverter]::ToUInt32($b, 0) } while ($n -ge 4200000000)
  $rng.Dispose()
  return ($n % 100000000).ToString("00000000")
}
function Invoke-Icacls([string[]]$IcaclsArgs) {
  $r = Invoke-Native icacls $IcaclsArgs
  if ($r.Code -ne 0) { throw "icacls 실패 (exit $($r.Code)): $($r.Text)" }
}

$me = [Security.Principal.WindowsIdentity]::GetCurrent()
$mySid = $me.User.Value

# ---------------------------------------------------------------- 1. Docker + 계정
Write-Step "Docker / 계정 확인"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "docker 명령이 없습니다. Docker Desktop 을 설치하고 다시 실행하세요." }
if ((Invoke-Native docker @("info", "--format", "{{.ServerVersion}}")).Code -ne 0) {
  throw "Docker Desktop 이 실행 중이 아닙니다. Docker Desktop 을 켠 뒤 다시 실행하세요."
}
Write-Host "Docker OK"
$consoleUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
if ($consoleUser -and ($consoleUser -ne $me.Name) -and -not $AllowOtherUser) {
  throw ("지금 PowerShell 계정($($me.Name))이 화면에 로그인한 계정($consoleUser)과 다릅니다. " +
    "자동 업데이트와 Docker Desktop 은 로그인한 계정에서 돌기 때문에, $consoleUser 로 로그인한 상태에서 " +
    "PowerShell 을 '관리자 권한으로 실행'(같은 계정 승격)해서 다시 실행하세요.")
}
Write-Host "계정: $($me.Name)"

# ---------------------------------------------------------------- 2. 설치 폴더 권한
if (-not $SkipFolderAcl) {
  Write-Step "설치 폴더 권한 제한 ($Root)"
  # 상속 끊기 + 이 사용자/SYSTEM/Administrators 만 (하위 폴더/파일에 상속)
  Invoke-Icacls @($Root, "/inheritance:r", "/grant:r", "*$($mySid):(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F")
  Write-Host "이 사용자 + SYSTEM + Administrators 만 접근할 수 있습니다."
}

# ---------------------------------------------------------------- 3. .env
Write-Step ".env (비밀값) 준비"
$envFile = Join-Path $Root ".env"
$created = $false
if (-not (Test-Path $envFile) -or $OverwriteEnv) {
  if ((Test-Path $envFile) -and $OverwriteEnv) {
    Write-Warning "-OverwriteEnv: 기존 .env 전체를 새 비밀값으로 교체합니다. 운영 DB가 있으면 즉시 중단하세요."
  }
  $content = @(
    "# deploy/setup.ps1 이 $(Get-Date -Format 'yyyy-MM-dd HH:mm') 에 생성. 커밋 금지.",
    "POSTGRES_PASSWORD=$(New-RandomHex 32)",
    "PIN_PEPPER=$(New-RandomHex 32)",
    "SETUP_CODE=$(New-SetupCode)",
    "WEB_PORT=$Port",
    "WEB_BIND=0.0.0.0",
    "ALLOWED_HOSTS=",
    "SUGO_IMAGE_REPO=$($script:SugoDefaultRepo)",
    "SUGO_IMAGE=",
    "BACKUP_DIR=./backups",
    "BACKUP_KEEP=14",
    "BACKUP_PRE_KEEP=5"
  ) -join "`n"
  # BOM 없는 UTF-8 (docker compose 가 첫 줄을 잘못 읽지 않도록)
  [System.IO.File]::WriteAllText($envFile, $content + "`n", (New-Object System.Text.UTF8Encoding($false)))
  $created = $true
}
$cfg = Read-EnvFile $envFile
$pw = [string]$cfg["POSTGRES_PASSWORD"]
if ($pw.Length -lt 32 -or $pw -match '__|generated|change|example' -or $pw -notmatch '^[A-Za-z0-9]+$') {
  throw ".env 의 POSTGRES_PASSWORD 가 비었거나 예시 값이거나 너무 짧습니다(영문/숫자 32자 이상). .env 를 지우고 setup.ps1 을 다시 실행하면 새로 만듭니다. (이미 DB 를 만든 뒤라면 docs/deploy-windows.md 의 문제 해결 참고)"
}
# 예전 .env 에 없던 값 채우기
if (-not $cfg["PIN_PEPPER"]) { Set-EnvValue $envFile "PIN_PEPPER" (New-RandomHex 32) }
if (-not $cfg["SETUP_CODE"]) { Set-EnvValue $envFile "SETUP_CODE" (New-SetupCode) }
if (-not $cfg["SUGO_IMAGE_REPO"]) { Set-EnvValue $envFile "SUGO_IMAGE_REPO" $script:SugoDefaultRepo }
if ($cfg["SUGO_IMAGE"] -and -not (Test-ImageRef $cfg["SUGO_IMAGE"])) {
  # 태그(:latest)는 쓰지 않는다. update.ps1 이 서명 확인 후 digest 로 채운다.
  Set-EnvValue $envFile "SUGO_IMAGE" ""
}
# 현재 사용자 + SYSTEM + Administrators 만 (상속 끊음)
Invoke-Icacls @($envFile, "/inheritance:r", "/grant:r", "*$($mySid):(R,W)", "*S-1-5-18:(F)", "*S-1-5-32-544:(F)")
if ($created) { Write-Host ".env 생성 완료 (DB 비밀번호와 PIN_PEPPER 는 화면에 출력하지 않습니다)" }
else { Write-Host ".env 확인 완료 (기존 값 유지)" }

# ---------------------------------------------------------------- 4. 폴더
Write-Step "백업/로그 폴더"
New-Item -ItemType Directory -Force -Path (Join-Path $Root "backups"), (Join-Path $Root "logs") | Out-Null
Write-Host "backups\, logs\ 준비"

# ---------------------------------------------------------------- 5. 방화벽
$firewallPolicy = Get-SugoFirewallPolicy -AllowTailscale:$AllowTailscale
$NonLanRanges = $firewallPolicy.NonLanRanges
if (-not $SkipFirewall) {
  Write-Step "Windows 방화벽 (개인 네트워크 + 로컬 서브넷만)"
  if (-not (Test-Admin)) {
    Write-Warning "관리자 권한이 아니라서 방화벽 규칙을 건너뜁니다. 관리자 PowerShell 에서 다시 실행하세요."
  } else {
    $allow = "Sugo web (LAN only)"
    $allowTailscale = "Sugo web (Tailscale only)"
    $blockProfile = "Sugo web block (public/domain networks)"
    $blockRemote = "Sugo web block (non-LAN addresses)"
    foreach ($n in @($allow, $allowTailscale, $blockProfile, $blockRemote)) {
      Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    }
    New-NetFirewallRule -DisplayName $allow -Direction Inbound -Action Allow -Protocol TCP `
      -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null
    # 허용 규칙은 OR 로 합쳐지므로, 다른 허용 규칙(Docker 프로그램 규칙 등)이 있어도 막히도록 "차단" 규칙을 둔다.
    if ($AllowTailscale) {
      New-NetFirewallRule -DisplayName $allowTailscale -Direction Inbound -Action Allow -Protocol TCP `
        -LocalPort $Port -Profile Any -RemoteAddress "100.64.0.0/10" | Out-Null
      # Block every non-Tailscale address on Public/Domain profiles. Windows block rules override allow rules.
      New-NetFirewallRule -DisplayName $blockProfile -Direction Inbound -Action Block -Protocol TCP `
        -LocalPort $Port -Profile Public, Domain -RemoteAddress $firewallPolicy.ProfileBlockRemote | Out-Null
    } else {
      New-NetFirewallRule -DisplayName $blockProfile -Direction Inbound -Action Block -Protocol TCP `
        -LocalPort $Port -Profile Public, Domain | Out-Null
    }
    New-NetFirewallRule -DisplayName $blockRemote -Direction Inbound -Action Block -Protocol TCP `
      -LocalPort $Port -Profile Any -RemoteAddress $NonLanRanges | Out-Null
    Write-Host "허용: '$allow' (TCP $Port, Private, LocalSubnet)"
    if ($AllowTailscale) { Write-Host "추가 허용: '$allowTailscale' (TCP $Port, 100.64.0.0/10만; 공용 인터넷은 차단)" }
    Write-Host "차단: '$blockProfile' (공용/도메인 네트워크), '$blockRemote' (LAN 밖 주소)"

    $profiles = Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory
    $profiles | Format-Table | Out-String | Write-Host
    if ($profiles | Where-Object { $_.NetworkCategory -eq "Public" }) {
      Write-Warning "공용(Public)으로 설정된 네트워크가 있습니다. 집 Wi-Fi/유선이라면 '개인(Private)'으로 바꿔야 태블릿에서 접속됩니다. (docs/deploy-windows.md 2번)"
    }

    Write-Step "Docker 가 만든 인바운드 방화벽 규칙 점검"
    $dockerRules = @(Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
      Where-Object { $_.Program -match 'docker|vpnkit|wsl' } |
      Get-NetFirewallRule -ErrorAction SilentlyContinue |
      Where-Object { $_.Direction -eq "Inbound" -and $_.Enabled -eq "True" } |
      Sort-Object -Property Name -Unique)
    if ($dockerRules.Count -eq 0) {
      Write-Host "Docker 관련 인바운드 규칙 없음"
    } else {
      $rows = foreach ($r in $dockerRules) {
        $addr = ($r | Get-NetFirewallAddressFilter).RemoteAddress -join ","
        $prog = ($r | Get-NetFirewallApplicationFilter).Program
        [pscustomobject]@{ DisplayName = $r.DisplayName; Action = $r.Action; Profile = $r.Profile; RemoteAddress = $addr; Program = (Split-Path -Leaf $prog) }
      }
      $rows | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
      $wide = @($dockerRules | Where-Object {
          $_.Action -eq "Allow" -and (
            "$($_.Profile)" -match 'Any|Public|Domain' -or
            (($_ | Get-NetFirewallAddressFilter).RemoteAddress -contains "Any"))
        })
      if ($wide.Count -gt 0) {
        if ($FixDockerRules) {
          $wide | Set-NetFirewallRule -Profile Private -RemoteAddress LocalSubnet
          Write-Host "Docker 허용 규칙 $($wide.Count)개를 '개인 네트워크 + 로컬 서브넷'으로 좁혔습니다."
        } else {
          Write-Warning ("Docker 허용 규칙 $($wide.Count)개가 공용/모든 주소에 열려 있습니다. 위 Sugo 차단 규칙 덕분에 Sugo 포트는 막히지만, " +
            "Docker 의 다른 포트까지 좁히려면 setup.ps1 -FixDockerRules 로 다시 실행하세요. (방화벽 전체를 끄지는 마세요)")
        }
      }
      if ($dockerRules | Where-Object { $_.Action -eq "Block" }) {
        Write-Warning "Docker 차단 규칙이 있습니다 (처음 '액세스 허용' 창에서 취소를 누른 경우). 태블릿 접속이 안 되면 그 규칙만 지우세요: Remove-NetFirewallRule -DisplayName '<위 이름>'"
      }
    }
  }
}

# ---------------------------------------------------------------- 6. 실행 (서명 확인 후)
Write-Step "이미지 서명 확인 + 실행"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "update.ps1") -Initial
if ($LASTEXITCODE -ne 0) {
  throw "이미지를 확인/실행하지 못했습니다. logs\update.log 를 보세요 (인터넷 연결, GHCR 패키지 공개 여부, 'Docker image' 워크플로 성공 여부)."
}

# ---------------------------------------------------------------- 7. 자동 업데이트
if (-not $SkipScheduledTask) {
  Write-Step "자동 업데이트 작업 등록 ($UpdateEveryMinutes 분마다)"
  $taskName = "Sugo auto update"
  $script = Join-Path $PSScriptRoot "update.ps1"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $Root
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $UpdateEveryMinutes)
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  # 현재 사용자 권한으로 (관리자 권한 불필요). Docker Desktop 은 로그인한 사용자 세션에서 돈다.
  $principal = New-ScheduledTaskPrincipal -UserId $me.Name -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Force | Out-Null
  Write-Host "작업 '$taskName' 등록 완료"
}

# ---------------------------------------------------------------- 안내
Write-Step "완료"
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "vEthernet*" } |
  Select-Object -ExpandProperty IPAddress
foreach ($ip in $ips) { Write-Host "태블릿에서 열기: http://$($ip):$Port" -ForegroundColor Green }
$code = (Read-EnvFile $envFile)["SETUP_CODE"]
Write-Host ""
Write-Host "처음 접속하면 '부모 설정'에서 부모 PIN(숫자 6자리 이상)을 바로 만들어 주세요." -ForegroundColor Yellow
Write-Host "그때 필요한 설치 코드: $code   (PIN 을 만든 뒤에는 쓰이지 않습니다. 나중에 다시 보려면 .env 의 SETUP_CODE)" -ForegroundColor Yellow
