<#
.SYNOPSIS
  새 이미지가 있으면 **서명을 확인한 뒤에만** 바꿔서 다시 시작 (작업 스케줄러가 10분마다 실행).

.DESCRIPTION
  docker.sock 을 컨테이너에 넘기는 Watchtower 대신, 호스트의 작업 스케줄러가 이 스크립트를 돌린다.
  1. maintenance.lock 이 있으면(복구 중) 아무것도 하지 않는다. 다른 배포 작업과 동시에 돌지 않는다.
  2. <저장소>:latest 의 digest 를 확인한다. .env 의 SUGO_IMAGE(지금 실행 중인 digest)와 같으면 끝.
  3. 그 digest 의 Sigstore 서명을 cosign 으로 검증한다: main 브랜치의 .github/workflows/docker.yml 이
     서명한 것만 통과. 실패하면 **기존 컨테이너를 그대로 두고** logs\update.log 에 REFUSED 로 남긴다.
  4. 업데이트 전 백업 (backups\sugo-pre-*.dump). 실패하면 업데이트하지 않는다.
  5. .env 의 SUGO_IMAGE 를 검증된 "<저장소>@sha256:..." 로 바꾸고 다시 시작.
  6. web 이 healthy 가 안 되면 이전 digest 로 되돌린다.
  - 이미지만 갱신한다. docker-compose.yml/스크립트 변경은 자동으로 가져오지 않는다 ('git pull' 후 setup.ps1 재실행).
  - 기록: logs\update.log (1MB 넘으면 .1 로 돌림)
#>
[CmdletBinding()]
param(
  # setup.ps1 이 처음 설치할 때: 돌고 있는 스택이 없으면 업데이트 전 백업을 건너뛴다
  [switch]$Initial,
  [int]$HealthTimeoutSeconds = 240
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot "lib.ps1")

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "update.log"
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 1MB)) { Move-Item $log "$log.1" -Force }

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-UpdatePausedByMaintenance {
  $status = Get-MaintenanceLockStatus $Root
  if (-not $status.Exists) { return $false }
  if ($status.Stale) {
    $ageHours = [Math]::Round($status.Age.TotalHours, 1)
    Write-Log "WARNING: stale maintenance.lock detected (age $ageHours hours, pid $($status.ProcessId)); removing it so updates can resume"
    Remove-Item -LiteralPath $status.Path -Force
    return $false
  }
  $ageMinutes = [Math]::Round($status.Age.TotalMinutes, 1)
  Write-Log "skip: maintenance.lock present (restore in progress; age $ageMinutes minutes, pid $($status.ProcessId))"
  return $true
}

$envFile = Join-Path $Root ".env"
$mutex = $null
try {
  if (Test-UpdatePausedByMaintenance) { exit 0 }
  $mutex = Enter-DeployLock -TimeoutSeconds 0
  if (-not $mutex) { Write-Log "skip: another deploy action is running"; exit 0 }
  # 잠금을 잡은 뒤 한 번 더 (복구가 막 시작됐을 수 있음)
  if (Test-UpdatePausedByMaintenance) { exit 0 }

  $info = Invoke-Native docker @("info", "--format", "{{.ServerVersion}}")
  if ($info.Code -ne 0) { Write-Log "skip: Docker Desktop not running"; exit 0 }
  if (-not (Test-Path $envFile)) { Write-Log "ERROR: .env missing (run deploy\setup.ps1)"; exit 1 }

  $cfg = Read-EnvFile $envFile
  $repo = if ($cfg["SUGO_IMAGE_REPO"]) { $cfg["SUGO_IMAGE_REPO"] } else { $script:SugoDefaultRepo }
  $current = [string]$cfg["SUGO_IMAGE"]

  # 1. 최신 digest
  try { $target = Resolve-LatestDigest -Repo $repo } catch { Write-Log "check failed: $($_.Exception.Message)"; exit 1 }
  $webId = Get-ServiceContainer "web"
  if ($current -eq $target -and $webId) { Write-Log "no change ($target)"; exit 0 }

  # 2. 서명 검증 (실패하면 아무것도 바꾸지 않는다)
  $sig = Test-SugoImageSignature -Ref $target
  if (-not $sig.Ok) {
    Write-Log "REFUSED $target : signature verification failed, keeping current ($current). $($sig.Reason)"
    exit 1
  }
  Write-Log "verified $target ($($sig.Reason))"

  # 3. 업데이트 전 백업
  $backupId = Get-ServiceContainer "backup"
  $dbId = Get-ServiceContainer "db"
  if ($backupId) {
    $b = Invoke-Native docker @("compose", "exec", "-T", "backup", "sh", "/backup.sh", "once", "pre")
    if ($b.Code -ne 0) { Write-Log "ERROR: pre-update backup failed, not updating: $($b.Text)"; exit 1 }
    Write-Log "pre-update backup: $($b.Lines | Select-Object -Last 1)"
  } elseif ($Initial -or -not $dbId) {
    Write-Log "no running stack: skip pre-update backup"
  } else {
    Write-Log "ERROR: db is running but backup container is not; not updating without a backup"
    exit 1
  }

  # 4. 검증된 digest 로 고정하고 다시 시작
  Set-EnvValue -Path $envFile -Key "SUGO_IMAGE" -Value $target
  $up = Invoke-Native docker @("compose", "up", "-d", "--remove-orphans")
  $healthy = ($up.Code -eq 0) -and (Wait-WebHealthy -TimeoutSeconds $HealthTimeoutSeconds)
  if ($healthy) {
    Write-Log "updated web image: $current -> $target"
    Invoke-Native docker @("image", "prune", "-f") | Out-Null
    exit 0
  }

  # 5. 실패: 이전 digest 로 되돌림 (이전 값이 검증된 digest 일 때만)
  Write-Log "ERROR: new image not healthy ($($up.Text))"
  if (Test-ImageRef $current) {
    Set-EnvValue -Path $envFile -Key "SUGO_IMAGE" -Value $current
    $back = Invoke-Native docker @("compose", "up", "-d", "--remove-orphans")
    Write-Log "rolled back to $current (exit $($back.Code)). DB 마이그레이션이 이미 적용됐을 수 있음: 문제가 있으면 backups\sugo-pre-*.dump 로 restore.ps1"
  }
  exit 1
} finally {
  Exit-DeployLock $mutex
}
