<#
.SYNOPSIS
  가장 최근 백업(또는 지정한 백업)이 실제로 복구되는지 확인. 운영 DB는 건드리지 않는다.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy\restore-test.ps1
  powershell -ExecutionPolicy Bypass -File .\deploy\restore-test.ps1 -File sugo-20261123-210000.dump
#>
param([string]$File = "")
Set-Location (Split-Path -Parent $PSScriptRoot)
if ($File -and ($File -notmatch '^sugo-\d{8}-\d{6}\.dump$')) { Write-Error "백업 파일 이름 형식이 아닙니다: $File"; exit 1 }
if ($File) { docker compose exec -T backup sh /restore-test.sh $File } else { docker compose exec -T backup sh /restore-test.sh }
exit $LASTEXITCODE
