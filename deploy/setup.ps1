<#
.SYNOPSIS
  Sugo 처음 설치 (집 Windows PC, Docker Desktop).

.DESCRIPTION
  1. Docker 가 켜져 있는지 확인
  2. .env 가 없으면 강한 랜덤 DB 비밀번호로 만들고, 현재 사용자만 읽을 수 있게 권한 제한
  3. 백업/로그 폴더 만들기
  4. Windows 방화벽: 웹 포트를 "개인(Private) 네트워크 + 로컬 서브넷"에서만 허용 (관리자 권한 필요)
  5. 이미지 받고 실행
  6. 작업 스케줄러에 10분마다 자동 업데이트(deploy/update.ps1) 등록

  여러 번 실행해도 안전합니다 (.env 는 덮어쓰지 않음).

.EXAMPLE
  # 관리자 PowerShell 에서, 저장소 폴더(예: C:\sugo)에서:
  powershell -ExecutionPolicy Bypass -File .\deploy\setup.ps1
#>
[CmdletBinding()]
param(
  [int]$Port = 3000,
  [switch]$SkipFirewall,
  [switch]$SkipScheduledTask,
  [int]$UpdateEveryMinutes = 10
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---------------------------------------------------------------- 1. Docker
Write-Step "Docker 확인"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "docker 명령이 없습니다. Docker Desktop 을 설치하고 다시 실행하세요." }
cmd /c "docker info >NUL 2>&1"
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop 이 실행 중이 아닙니다. Docker Desktop 을 켠 뒤 다시 실행하세요." }
Write-Host "Docker OK"

# ---------------------------------------------------------------- 2. .env
Write-Step ".env (비밀값) 준비"
$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
  Write-Host ".env 가 이미 있습니다. 그대로 둡니다."
} else {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $password = -join ($bytes | ForEach-Object { $_.ToString("x2") })   # 64자 hex (URL에 안전)
  $content = @(
    "# deploy/setup.ps1 이 $(Get-Date -Format 'yyyy-MM-dd HH:mm') 에 생성. 커밋 금지.",
    "POSTGRES_PASSWORD=$password",
    "WEB_PORT=$Port",
    "WEB_BIND=0.0.0.0",
    "ALLOWED_HOSTS=",
    "SUGO_IMAGE=ghcr.io/jeongyounghoon-star/sugo:latest",
    "BACKUP_DIR=./backups",
    "BACKUP_KEEP=14"
  ) -join "`n"
  # BOM 없는 UTF-8 (docker compose 가 첫 줄을 잘못 읽지 않도록)
  [System.IO.File]::WriteAllText($envFile, $content + "`n", (New-Object System.Text.UTF8Encoding($false)))
  # 현재 사용자 + SYSTEM + Administrators 만 접근
  icacls $envFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" "SYSTEM:(F)" "*S-1-5-32-544:(F)" | Out-Null
  Write-Host ".env 생성 완료 (DB 비밀번호는 화면에 출력하지 않습니다)"
}

# ---------------------------------------------------------------- 3. 폴더
Write-Step "백업/로그 폴더"
New-Item -ItemType Directory -Force -Path (Join-Path $Root "backups"), (Join-Path $Root "logs") | Out-Null
Write-Host "backups\, logs\ 준비"

# ---------------------------------------------------------------- 4. 방화벽
if (-not $SkipFirewall) {
  Write-Step "Windows 방화벽 (개인 네트워크 + 로컬 서브넷만 허용)"
  if (-not (Test-Admin)) {
    Write-Warning "관리자 권한이 아니라서 방화벽 규칙을 건너뜁니다. 관리자 PowerShell 에서 다시 실행하거나 docs/deploy-windows.md 의 명령을 직접 실행하세요."
  } else {
    $ruleName = "Sugo web (LAN only)"
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP `
      -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null
    Write-Host "규칙 '$ruleName' 추가: TCP $Port, Private 프로필, LocalSubnet"
    $profiles = Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory
    $profiles | Format-Table | Out-String | Write-Host
    if ($profiles | Where-Object { $_.NetworkCategory -eq "Public" }) {
      Write-Warning "공용(Public)으로 설정된 네트워크가 있습니다. 집 Wi-Fi/유선이라면 '개인(Private)'으로 바꿔야 태블릿에서 접속됩니다. (docs/deploy-windows.md 참고)"
    }
  }
}

# ---------------------------------------------------------------- 5. 실행
Write-Step "이미지 받기 + 실행"
docker compose pull
if ($LASTEXITCODE -ne 0) { throw "이미지를 받지 못했습니다. 인터넷 연결과 GHCR 패키지 공개 여부를 확인하세요." }
docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { throw "docker compose up 실패. 'docker compose logs' 로 확인하세요." }

# ---------------------------------------------------------------- 6. 자동 업데이트
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
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
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
Write-Host "처음 접속하면 '부모 설정'에서 부모 PIN 을 바로 만들어 주세요."
