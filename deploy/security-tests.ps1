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

# PowerShell variable names are case-insensitive: assigning e.g. $allowTailscale = "..." in setup.ps1
# overwrites [switch]$AllowTailscale and throws "Boolean parameters accept only Boolean values and numbers".
# Reject any assignment (or foreach variable) that reuses a parameter name in the same scope.
$paramCollisions = @()
foreach ($script in Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1) {
  $tokens = $null; $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$parseErrors)
  Assert-True ($parseErrors.Count -eq 0) "$($script.Name) has parse errors: $($parseErrors -join '; ')"
  $scopes = @($ast) + @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true) |
      ForEach-Object { $_.Body })
  foreach ($scope in $scopes) {
    $paramNames = @()
    if ($scope.ParamBlock) { $paramNames += $scope.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath } }
    $fnDef = $scope.Parent
    if ($fnDef -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $fnDef.Parameters) {
      $paramNames += $fnDef.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath }
    }
    if ($paramNames.Count -eq 0) { continue }
    $targets = $scope.FindAll({
        param($n)
        $n -is [System.Management.Automation.Language.AssignmentStatementAst] -or
        $n -is [System.Management.Automation.Language.ForEachStatementAst]
      }, $true) | Where-Object {
      # Skip nodes inside a nested function: that is a separate scope, checked on its own.
      $p = $_.Parent
      while ($p -and $p -ne $scope) {
        if ($p -is [System.Management.Automation.Language.FunctionDefinitionAst]) { break }
        $p = $p.Parent
      }
      $p -eq $scope
    }
    foreach ($t in $targets) {
      $lhs = if ($t -is [System.Management.Automation.Language.ForEachStatementAst]) { $t.Variable } else { $t.Left }
      while ($lhs -is [System.Management.Automation.Language.ConvertExpressionAst]) { $lhs = $lhs.Child }
      if ($lhs -isnot [System.Management.Automation.Language.VariableExpressionAst]) { continue }
      $name = $lhs.VariablePath.UserPath
      foreach ($pn in $paramNames) {
        if ($name -ieq $pn) { $paramCollisions += "$($script.Name):$($lhs.Extent.StartLineNumber) `$$name reuses parameter `$$pn" }
      }
    }
  }
}
Assert-True ($paramCollisions.Count -eq 0) ("script variables overwrite parameters:`n" + ($paramCollisions -join "`n"))

# setup.ps1 switches must bind the same way the owner runs it: `powershell -File setup.ps1 [-AllowTailscale]`.
# Run the real param block in a child process (no admin, no side effects) and check what bound.
$setupAst = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot "setup.ps1"), [ref]$null, [ref]$null)
$bindingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sugo-binding-test-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $bindingRoot | Out-Null
try {
  $stub = Join-Path $bindingRoot "setup-params.ps1"
  $stubBody = @'
$ErrorActionPreference = "Stop"
$firewallPolicy = Get-SugoFirewallPolicy -AllowTailscale:$AllowTailscale
"AllowTailscale=$([bool]$AllowTailscale);SkipFirewall=$([bool]$SkipFirewall);Port=$Port;TailscaleAllowed=$($firewallPolicy.TailscaleAllowed)"
'@
  $stubText = $setupAst.ParamBlock.Extent.Text + "`r`n. '" + (Join-Path $PSScriptRoot "lib.ps1").Replace("'", "''") + "'`r`n" + $stubBody
  [System.IO.File]::WriteAllText($stub, $stubText, (New-Object System.Text.UTF8Encoding($true)))
  $shells = @()
  if (Get-Command powershell.exe -ErrorAction SilentlyContinue) { $shells += "powershell.exe" }
  if (Get-Command pwsh -ErrorAction SilentlyContinue) { $shells += "pwsh" }
  Assert-True ($shells.Count -gt 0) "no PowerShell executable found for the binding test"
  foreach ($sh in $shells) {
    $cases = @(
      @{ Args = @(); Expect = "AllowTailscale=False;SkipFirewall=False;Port=3000;TailscaleAllowed=False" },
      @{ Args = @("-AllowTailscale"); Expect = "AllowTailscale=True;SkipFirewall=False;Port=3000;TailscaleAllowed=True" },
      @{ Args = @("-AllowTailscale", "-SkipFirewall", "-Port", "3100"); Expect = "AllowTailscale=True;SkipFirewall=True;Port=3100;TailscaleAllowed=True" }
    )
    foreach ($case in $cases) {
      $out = & $sh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $stub @($case.Args) 2>&1
      $code = $LASTEXITCODE
      $line = @($out | ForEach-Object { "$_" } | Where-Object { $_ -like "AllowTailscale=*" }) -join ""
      Assert-True ($code -eq 0 -and $line -eq $case.Expect) ("$sh -File setup.ps1 $($case.Args -join ' ') bound wrongly (exit $code): " + ($out -join " | "))
    }
  }
} finally {
  Remove-Item -LiteralPath $bindingRoot -Recurse -Force
}

$composeText = Get-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) "docker-compose.yml") -Raw
Assert-True ($composeText -match 'PIN_PEPPER: \$\{PIN_PEPPER:\?') "docker-compose.yml does not require PIN_PEPPER"
Assert-True ($composeText -match 'SETUP_CODE: \$\{SETUP_CODE:\?') "docker-compose.yml does not require SETUP_CODE"

Write-Host "deploy security tests passed"
