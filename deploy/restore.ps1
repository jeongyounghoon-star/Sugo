<#
.SYNOPSIS
  백업 파일로 운영 DB 를 되돌린다 (데이터가 망가졌을 때만).

.DESCRIPTION
  1. maintenance.lock 을 만들고 배포 잠금을 잡는다 → 그동안 자동 업데이트(update.ps1)는 아무것도 하지 않는다
  2. 지금 DB 를 한 번 더 백업 (backups\sugo-pre-*.dump): 복구가 잘못돼도 되돌릴 수 있게
  3. web 을 멈추고 pg_restore --clean --single-transaction --exit-on-error
     (한 트랜잭션이라 중간에 실패하면 DB 는 복구 전 상태 그대로)
  4. web 다시 시작, 잠금 해제

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\restore.ps1 -File sugo-20261123-210000.dump
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$File,
  # 확인 질문 없이 진행
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot "lib.ps1")

if ($File -notmatch '^sugo-(pre-)?\d{8}-\d{6}\.dump$') { throw "백업 파일 이름 형식이 아닙니다: $File" }
if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $Root "backups") $File))) { throw "backups 폴더에 $File 이 없습니다." }
if (-not $Force) {
  $answer = Read-Host "운영 DB 를 $File 시점으로 되돌립니다. 그 뒤의 학습 기록은 사라집니다. 계속하려면 yes"
  if ($answer -ne "yes") { Write-Host "취소했습니다."; exit 1 }
}

$lockFile = Join-Path $Root "maintenance.lock"
Set-Content -LiteralPath $lockFile -Value "restore $File $(Get-Date -Format s)" -Encoding ASCII
$mutex = $null
$webStopped = $false
try {
  Write-Host "자동 업데이트가 끝나기를 기다리는 중..."
  $mutex = Enter-DeployLock -TimeoutSeconds 600
  if (-not $mutex) { throw "10분 안에 배포 잠금을 잡지 못했습니다. 잠시 뒤 다시 실행하세요." }

  Write-Host "복구 전 백업..."
  $pre = Invoke-Native docker @("compose", "exec", "-T", "backup", "sh", "/backup.sh", "once", "pre")
  if ($pre.Code -ne 0) { throw "복구 전 백업 실패 (복구하지 않음): $($pre.Text)" }
  Write-Host ($pre.Lines | Select-Object -Last 1)

  $stop = Invoke-Native docker @("compose", "stop", "web")
  if ($stop.Code -ne 0) { throw "web 을 멈추지 못했습니다: $($stop.Text)" }
  $webStopped = $true

  Write-Host "복구 중: $File"
  $r = Invoke-Native docker @("compose", "exec", "-T", "backup", "pg_restore", "--clean", "--if-exists", "--no-owner",
    "--single-transaction", "--exit-on-error", "-d", "sugo", "/backups/$File")
  if ($r.Code -ne 0) { throw "복구 실패. DB 는 복구 전 상태 그대로입니다 (한 트랜잭션): $($r.Text)" }
  Write-Host "OK: 복구 완료" -ForegroundColor Green
} finally {
  if ($webStopped) {
    $start = Invoke-Native docker @("compose", "start", "web")
    if ($start.Code -ne 0) { Write-Warning "web 을 다시 켜지 못했습니다: docker compose up -d 를 직접 실행하세요. $($start.Text)" }
  }
  Exit-DeployLock $mutex
  Remove-Item -LiteralPath $lockFile -ErrorAction SilentlyContinue
}
