<#
.SYNOPSIS
  새 이미지가 있으면 받아서 다시 시작 (작업 스케줄러가 10분마다 실행).

.DESCRIPTION
  docker.sock 을 컨테이너에 넘기는 Watchtower 대신, 호스트의 작업 스케줄러가 이 스크립트를 돌린다.
  - 이미지만 갱신한다. docker-compose.yml/스크립트 변경은 자동으로 가져오지 않는다
    (집 PC에서 원격 코드가 바로 실행되는 범위를 줄이기 위해). 그런 변경은 'git pull' 후 setup.ps1 재실행.
  - 기록: logs\update.log (1MB 넘으면 .1 로 돌림)
#>
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "update.log"
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 1MB)) { Move-Item $log "$log.1" -Force }

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line -Encoding UTF8
}

cmd /c "docker info >NUL 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Log "skip: Docker Desktop not running"; exit 0 }

$before = (cmd /c "docker compose images web --format json 2>NUL") -join ""
$pull = cmd /c "docker compose pull --quiet 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Log "pull failed: $($pull -join ' ')"; exit 1 }

$up = cmd /c "docker compose up -d --remove-orphans 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Log "up failed: $($up -join ' ')"; exit 1 }

$after = (cmd /c "docker compose images web --format json 2>NUL") -join ""
if ($before -ne $after) {
  Write-Log "updated web image"
  cmd /c "docker image prune -f >NUL 2>&1"
} else {
  Write-Log "no change"
}
exit 0
