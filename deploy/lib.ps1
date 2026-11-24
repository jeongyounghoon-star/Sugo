# Shared helpers for setup.ps1 / update.ps1 / restore.ps1 (dot-source: . "$PSScriptRoot\lib.ps1").
# Works on Windows PowerShell 5.1 and PowerShell 7 (CI runs the same code on Linux).
# Kept ASCII-only on purpose (no encoding surprises when dot-sourced).

# ---------------------------------------------------------------- trust settings
# Image that the home PC runs. update.ps1 only ever runs "<repo>@sha256:<digest>" after the
# signature check below passes; the digest is then pinned in .env (SUGO_IMAGE).
$script:SugoDefaultRepo = "ghcr.io/jeongyounghoon-star/sugo"

# Keyless (Sigstore) signature made by .github/workflows/docker.yml running on main.
# Anything else (another workflow, another branch, a PR, a fork, a laptop) does not match.
$script:SugoSignerIdentityRegex = '^https://github\.com/jeongyounghoon-star/Sugo/\.github/workflows/docker\.yml@refs/heads/main$'
$script:SugoSignerIssuer = "https://token.actions.githubusercontent.com"

# cosign runs in a throwaway container (nothing to install on the PC). Pinned by digest.
$script:CosignImage = "ghcr.io/sigstore/cosign/cosign:v3.1.4@sha256:0f06154836d2de34f887a5c273506d52ca43edaa1d9e53e6510fa78a48f69c2d"

$script:DeployMutexName = "Global\SugoDeploy"

# ---------------------------------------------------------------- helpers
function Invoke-Native {
  <# Runs a native command; returns @{ Code; Lines } with stdout+stderr as strings (PS 5.1 safe). #>
  param([Parameter(Mandatory)][string]$Exe, [string[]]$ArgList = @())
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $lines = @(& $Exe @ArgList 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  return [pscustomobject]@{ Code = $code; Lines = $lines; Text = ($lines -join " | ") }
}

function Read-EnvFile {
  param([Parameter(Mandatory)][string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $map[$Matches[1]] = $Matches[2].Trim() }
  }
  return $map
}

function Set-EnvValue {
  <# Sets KEY=value in the .env file (keeps other lines, UTF-8 without BOM, keeps the file's ACL). #>
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Key, [Parameter(Mandatory)][AllowEmptyString()][string]$Value)
  if ($Value -match '[\r\n]') { throw "invalid value for $Key" }
  $lines = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $Path) { $lines.AddRange([string[]][System.IO.File]::ReadAllLines($Path)) }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($Key))=") { $lines[$i] = "$Key=$Value"; $found = $true }
  }
  if (-not $found) { $lines.Add("$Key=$Value") }
  # WriteAllText on the existing file truncates in place, so the restricted ACL stays.
  [System.IO.File]::WriteAllText($Path, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
}

function Test-ImageRef {
  param([string]$Ref)
  return ($Ref -match '^[a-z0-9][a-z0-9._:/-]*@sha256:[0-9a-f]{64}$')
}

function Resolve-LatestDigest {
  <# Pulls <repo>:latest (download only, nothing runs) and returns "<repo>@sha256:..." or throws. #>
  param([Parameter(Mandatory)][string]$Repo, [string]$Tag = "latest")
  $pull = Invoke-Native docker @("pull", "--quiet", "$($Repo):$Tag")
  if ($pull.Code -ne 0) { throw "pull $($Repo):$Tag failed: $($pull.Text)" }
  $insp = Invoke-Native docker @("image", "inspect", "--format", "{{json .RepoDigests}}", "$($Repo):$Tag")
  if ($insp.Code -ne 0) { throw "inspect failed: $($insp.Text)" }
  $parsed = ($insp.Lines -join "") | ConvertFrom-Json
  $digests = @($parsed | ForEach-Object { $_ })   # PS 5.1 returns a JSON array as one object
  $match = @($digests | Where-Object { $_ -like "$Repo@sha256:*" })
  if ($match.Count -lt 1) { throw "no digest for $Repo in $($insp.Text)" }
  $ref = [string]$match[0]
  if (-not (Test-ImageRef $ref)) { throw "unexpected digest ref: $ref" }
  return $ref
}

function Test-SugoImageSignature {
  <#
    Verifies the keyless cosign signature of an image *by digest*.
    Returns @{ Ok = $true/$false; Reason = "..." }. Never throws for a bad signature.
    Test-only overrides (process environment, not .env): SUGO_SIGNER_IDENTITY_REGEX, SUGO_COSIGN_DOCKER_ARGS.
  #>
  param(
    [Parameter(Mandatory)][string]$Ref,
    [string]$IdentityRegex = $(if ($env:SUGO_SIGNER_IDENTITY_REGEX) { $env:SUGO_SIGNER_IDENTITY_REGEX } else { $script:SugoSignerIdentityRegex }),
    [string]$Issuer = $script:SugoSignerIssuer
  )
  if (-not (Test-ImageRef $Ref)) { return [pscustomobject]@{ Ok = $false; Reason = "not a digest reference: $Ref" } }
  $digest = $Ref.Substring($Ref.IndexOf("@") + 1)
  $dockerArgs = @("run", "--rm", "--read-only", "--tmpfs", "/tmp:size=64m", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "-e", "HOME=/tmp")
  if ($env:SUGO_COSIGN_DOCKER_ARGS) { $dockerArgs += ($env:SUGO_COSIGN_DOCKER_ARGS -split '\s+' | Where-Object { $_ }) }
  $dockerArgs += @($script:CosignImage, "verify", $Ref,
    "--certificate-identity-regexp", $IdentityRegex,
    "--certificate-oidc-issuer", $Issuer,
    "--output", "json")
  $r = Invoke-Native docker $dockerArgs
  if ($r.Code -ne 0) { return [pscustomobject]@{ Ok = $false; Reason = "cosign verify failed (exit $($r.Code)): $($r.Text)" } }
  $jsonLine = $r.Lines | Where-Object { $_.TrimStart().StartsWith("[") } | Select-Object -Last 1
  if (-not $jsonLine) { return [pscustomobject]@{ Ok = $false; Reason = "cosign printed no result" } }
  try { $parsed = $jsonLine | ConvertFrom-Json; $items = @($parsed | ForEach-Object { $_ }) } catch { return [pscustomobject]@{ Ok = $false; Reason = "cosign output is not JSON" } }
  $signed = @($items | ForEach-Object { $_.critical.image.'docker-manifest-digest' })
  if ($signed.Count -lt 1) { return [pscustomobject]@{ Ok = $false; Reason = "no signed digest in cosign output" } }
  foreach ($d in $signed) {
    if ($d -ne $digest) { return [pscustomobject]@{ Ok = $false; Reason = "signature is for $d, not $digest" } }
  }
  return [pscustomobject]@{ Ok = $true; Reason = "signed by $IdentityRegex" }
}

function Enter-DeployLock {
  <# One deploy action at a time (update.ps1 vs restore.ps1). Returns the mutex or $null on timeout. #>
  param([int]$TimeoutSeconds = 0)
  $m = New-Object System.Threading.Mutex($false, $script:DeployMutexName)
  try {
    if ($m.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds))) { return $m }
  } catch [System.Threading.AbandonedMutexException] {
    return $m # previous holder died; we own it now
  }
  $m.Dispose()
  return $null
}

function Exit-DeployLock {
  param($Mutex)
  if ($Mutex) { try { $Mutex.ReleaseMutex() } catch {} ; $Mutex.Dispose() }
}

function Get-ServiceContainer {
  param([Parameter(Mandatory)][string]$Service)
  $r = Invoke-Native docker @("compose", "ps", "-q", $Service)
  if ($r.Code -ne 0) { return $null }
  $id = ($r.Lines | Where-Object { $_ -match '^[0-9a-f]{12,64}$' } | Select-Object -First 1)
  return $id
}

function Wait-WebHealthy {
  param([int]$TimeoutSeconds = 240)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $cid = Get-ServiceContainer "web"
    if ($cid) {
      $h = Invoke-Native docker @("inspect", "--format", "{{.State.Health.Status}}", $cid)
      if (($h.Lines -join "").Trim() -eq "healthy") { return $true }
    }
    Start-Sleep -Seconds 5
  }
  return $false
}

function Test-MaintenanceLock {
  param([Parameter(Mandatory)][string]$Root)
  return (Test-Path -LiteralPath (Join-Path $Root "maintenance.lock"))
}
