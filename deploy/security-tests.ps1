$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib.ps1")

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

# Production hosts must ignore CI-only trust overrides.
$oldNodeEnv = $env:NODE_ENV
$oldGithubActions = $env:GITHUB_ACTIONS
$oldIdentity = $env:SUGO_SIGNER_IDENTITY_REGEX
$oldDockerArgs = $env:SUGO_COSIGN_DOCKER_ARGS
try {
  $env:NODE_ENV = "production"
  $env:GITHUB_ACTIONS = "false"
  $env:SUGO_SIGNER_IDENTITY_REGEX = "^https://attacker.invalid/"
  $env:SUGO_COSIGN_DOCKER_ARGS = "--network host"
  $script:CapturedArgs = @()
  function Invoke-Native {
    param([string]$Exe, [string[]]$ArgList)
    $script:CapturedArgs = $ArgList
    $digest = "sha256:" + ("a" * 64)
    $json = '[{"critical":{"image":{"docker-manifest-digest":"' + $digest + '"}}}]'
    return [pscustomobject]@{ Code = 0; Lines = @($json); Text = $json }
  }
  $ref = "ghcr.io/jeongyounghoon-star/sugo@sha256:" + ("a" * 64)
  $result = Test-SugoImageSignature -Ref $ref
  Assert-True $result.Ok "signature fixture should pass"
  $joined = $script:CapturedArgs -join " "
  Assert-True ($joined.Contains($script:SugoSignerIdentityRegex)) "production signer identity was not enforced"
  Assert-True (-not $joined.Contains("attacker.invalid")) "production accepted the test signer override"
  Assert-True (-not $joined.Contains("--network host")) "production accepted test-only Docker arguments"
} finally {
  $env:NODE_ENV = $oldNodeEnv
  $env:GITHUB_ACTIONS = $oldGithubActions
  $env:SUGO_SIGNER_IDENTITY_REGEX = $oldIdentity
  $env:SUGO_COSIGN_DOCKER_ARGS = $oldDockerArgs
}

# Locks carry an ISO timestamp and PID, and expire after six hours.
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sugo-security-test-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  $lockPath = New-MaintenanceLock -Root $tempRoot -Operation "restore"
  $record = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
  Assert-True ($record.processId -eq $PID) "maintenance lock does not record the PID"
  Assert-True ([bool]$record.createdAt) "maintenance lock does not record its creation time"
  Assert-True (-not (Get-MaintenanceLockStatus $tempRoot).Stale) "new maintenance lock was marked stale"
  $record.createdAt = [DateTimeOffset]::UtcNow.AddHours(-7).ToString("o")
  Set-Content -LiteralPath $lockPath -Value ($record | ConvertTo-Json -Compress) -Encoding ASCII
  Assert-True (Get-MaintenanceLockStatus $tempRoot).Stale "old maintenance lock was not marked stale"
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}

# CGNAT/Tailscale is blocked by default and carved out only by the explicit option.
$defaultFirewall = Get-SugoFirewallPolicy
$tailscaleFirewall = Get-SugoFirewallPolicy -AllowTailscale
Assert-True (($defaultFirewall.NonLanRanges -join ",").Contains("11.0.0.0-126.255.255.255")) "default policy does not block 100.64.0.0/10"
Assert-True (($tailscaleFirewall.NonLanRanges -join ",").Contains("100.128.0.0-126.255.255.255")) "Tailscale policy did not carve out 100.64.0.0/10"
Assert-True $tailscaleFirewall.TailscaleAllowed "Tailscale opt-in was not recorded"

# setup.ps1 must require explicit switches for both sensitive behavior changes.
$setupText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "setup.ps1") -Raw
Assert-True ($setupText -match '\[switch\]\$OverwriteEnv') "setup.ps1 has no explicit .env overwrite switch"
Assert-True ($setupText -match '\[switch\]\$AllowTailscale') "setup.ps1 has no explicit Tailscale switch"
Assert-True ($setupText -match '-not \(Test-Path \$envFile\) -or \$OverwriteEnv') "setup.ps1 does not preserve .env by default"

$composeText = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) "docker-compose.yml") -Raw
Assert-True ($composeText -match 'PIN_PEPPER: \$\{PIN_PEPPER:\?') "docker-compose.yml does not require PIN_PEPPER"
Assert-True ($composeText -match 'SETUP_CODE: \$\{SETUP_CODE:\?') "docker-compose.yml does not require SETUP_CODE"

Write-Host "deploy security tests passed"
