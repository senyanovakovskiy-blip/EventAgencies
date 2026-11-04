$ErrorActionPreference = 'Stop'

# An unset or empty PORT uses the default. Any supplied value must be decimal.
$configuredPort = [Environment]::GetEnvironmentVariable('PORT', 'Process')
$previewPort = 8781
if (-not [string]::IsNullOrEmpty($configuredPort)) {
  $parsedPort = 0
  if ($configuredPort -cnotmatch '\A[0-9]+\z' -or
      -not [int]::TryParse($configuredPort, [ref]$parsedPort) -or
      $parsedPort -lt 1 -or $parsedPort -gt 65535) {
    throw 'PORT must be a decimal integer from 1 to 65535; unset it to use 8781.'
  }
  $previewPort = $parsedPort
}
$portText = $previewPort.ToString([Globalization.CultureInfo]::InvariantCulture)
$siteUrl = "http://127.0.0.1:$portText"

function Assert-PortAvailable {
  param([int]$Port)
  try {
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  } catch {
    throw 'Could not check local listening ports. The server was not started.'
  }
  if (@($listeners | Where-Object { $_.Port -eq $Port }).Count -gt 0) {
    throw "Port $Port is already in use. Stop the other listener yourself or choose a different PORT."
  }
}

function Stop-OwnedProcess {
  param([Diagnostics.Process]$Process)
  try {
    $Process.Refresh()
    if ($Process.HasExited) { return $true }
    $Process.Kill()
    return $Process.WaitForExit(2000)
  } catch {
    return $false
  }
}

# A PATH entry can be a version-manager shim. Ask it for the actual executable
# and version, then use that executable for both the build and the server.
$nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nodeCommand) { $nodeCandidate = $nodeCommand.Source }
else { $nodeCandidate = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeCandidate -PathType Leaf)) { throw 'Install Node.js 24 or newer.' }
try {
  $nodeMetadataLines = @(& $nodeCandidate -p 'JSON.stringify({execPath:process.execPath,version:process.version})' 2>$null)
  $nodeMetadataExit = $LASTEXITCODE
} catch {
  throw 'Could not determine the Node.js executable and version. Check the Node.js installation or version-manager shim.'
}
if ($nodeMetadataExit -ne 0 -or $nodeMetadataLines.Count -ne 1 -or $nodeMetadataLines[0] -isnot [string]) {
  throw 'Could not determine the Node.js executable and version. Check the Node.js installation or version-manager shim.'
}
try {
  $nodeMetadata = $nodeMetadataLines[0] | ConvertFrom-Json -ErrorAction Stop
} catch {
  throw 'Node.js returned invalid executable or version metadata.'
}
if ($null -eq $nodeMetadata -or $nodeMetadata.execPath -isnot [string] -or
    $nodeMetadata.version -isnot [string]) {
  throw 'Node.js returned invalid executable or version metadata.'
}
$versionMatch = [regex]::Match($nodeMetadata.version, '\Av([0-9]+)\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?\z')
if (-not $versionMatch.Success) { throw 'Node.js returned invalid executable or version metadata.' }
$nodeMajor = 0
if (-not [int]::TryParse($versionMatch.Groups[1].Value, [ref]$nodeMajor) -or $nodeMajor -lt 24) {
  throw 'Node.js 24 or newer is required for local inquiry storage.'
}
$nodePath = $nodeMetadata.execPath
if ($nodePath -notmatch '\A(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])' -or
    -not [IO.File]::Exists($nodePath) -or [IO.Path]::GetExtension($nodePath) -ine '.exe') {
  throw 'Node.js did not report an absolute path to an existing node executable.'
}

# One mutex per normalized folder coordinates launchers through build and
# readiness. The marker also protects local-dist while the server keeps running.
$projectPath = [IO.Path]::GetFullPath($PSScriptRoot)
$pathRoot = [IO.Path]::GetPathRoot($projectPath)
if ($projectPath.Length -gt $pathRoot.Length) { $projectPath = $projectPath.TrimEnd([char[]]@('\', '/')) }
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $pathHash = [BitConverter]::ToString($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectPath.ToUpperInvariant()))).Replace('-', '')
} finally {
  $sha256.Dispose()
}
$mutex = [Threading.Mutex]::new($false, "Global\EventAgencies.LocalBuild.$pathHash")
$mutexAcquired = $false
$logDirectory = Join-Path $projectPath 'private-data'
$markerPath = Join-Path $logDirectory 'launcher-state.json'
$serverPath = Join-Path $projectPath 'server.mjs'
$markerOwned = $false
$buildStartAttempted = $false
$serverStartAttempted = $false
$buildProcess = $null
$serverProcess = $null
$listenerJob = $null
$ready = $false
$wait = $null
$stdoutLog = $null
$stderrLog = $null
$recoveryHint = 'After confirming no build or server from this folder is running, remove private-data\launcher-state.json manually.'

try {
  try {
    $mutexAcquired = $mutex.WaitOne(0)
  } catch {
    $mutexError = $_.Exception
    while ($mutexError.InnerException) { $mutexError = $mutexError.InnerException }
    if ($mutexError -is [Threading.AbandonedMutexException]) { $mutexAcquired = $true }
    else { throw }
  }
  if (-not $mutexAcquired) {
    throw 'Another launcher is preparing this folder. Wait for it to finish; use a separate extracted folder for a parallel server.'
  }
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

  # Treat unreadable, malformed or incomplete markers as unknown, never as stale.
  try {
    $markerJson = [IO.File]::ReadAllText($markerPath)
  } catch {
    $readError = $_.Exception
    while ($readError.InnerException) { $readError = $readError.InnerException }
    if ($readError -is [IO.FileNotFoundException]) { $markerJson = $null }
    else { throw "Cannot read the startup marker. $recoveryHint" }
  }
  if ($null -ne $markerJson) {
    try { $marker = $markerJson | ConvertFrom-Json -ErrorAction Stop }
    catch { throw "The startup marker is invalid. $recoveryHint" }
    if ($null -eq $marker -or $marker.format -ne 1 -or $marker.projectPath -isnot [string] -or
        -not [string]::Equals($marker.projectPath, $projectPath, [StringComparison]::OrdinalIgnoreCase)) {
      throw "The startup marker does not identify this folder. $recoveryHint"
    }
    if ($marker.state -ceq 'starting') {
      throw "A previous startup was interrupted, so its processes cannot be identified safely. $recoveryHint"
    }
    $recordedPid = 0
    $recordedTicks = [long]0
    $recordedPort = 0
    if ($marker.state -cne 'server' -or
        -not [int]::TryParse([string]$marker.pid, [ref]$recordedPid) -or $recordedPid -le 0 -or
        -not [long]::TryParse([string]$marker.startUtcTicks, [ref]$recordedTicks) -or $recordedTicks -le 0 -or
        -not [int]::TryParse([string]$marker.port, [ref]$recordedPort) -or $recordedPort -lt 1 -or $recordedPort -gt 65535 -or
        $marker.serverPath -isnot [string] -or
        -not [string]::Equals($marker.serverPath, $serverPath, [StringComparison]::OrdinalIgnoreCase) -or
        $marker.nodePath -isnot [string] -or [string]::IsNullOrWhiteSpace($marker.nodePath)) {
      throw "The startup marker is invalid. $recoveryHint"
    }
    $recordedProcess = $null
    $recordedProcessMissing = $false
    try {
      $recordedProcess = [Diagnostics.Process]::GetProcessById($recordedPid)
    } catch {
      $processError = $_.Exception
      while ($processError.InnerException) { $processError = $processError.InnerException }
      if ($processError -is [ArgumentException]) { $recordedProcessMissing = $true }
      else { throw "Cannot check the process in the startup marker. $recoveryHint" }
    }
    if (-not $recordedProcessMissing) {
      try {
        $actualTicks = $recordedProcess.StartTime.ToUniversalTime().Ticks
      } catch {
        throw "Cannot verify the process in the startup marker. $recoveryHint"
      } finally {
        $recordedProcess.Dispose()
      }
      if ($actualTicks -eq $recordedTicks) {
        throw "A server started from this folder is still running (PID $recordedPid, port $recordedPort). Stop it yourself; use a separate extracted folder for a parallel server."
      }
    }
  }

  Assert-PortAvailable $previewPort

  # Write a reservation before any child starts. If this launcher is killed at
  # an uncertain point, a later launcher fails closed instead of rebuilding.
  $reservation = @{
    format = 1; state = 'starting'; projectPath = $projectPath
    launcherPid = $PID; port = $previewPort
  }
  [IO.File]::WriteAllText($markerPath, ($reservation | ConvertTo-Json -Compress), [Text.Encoding]::UTF8)
  $markerOwned = $true

  # Give the build its own environment; the caller's variables are never changed.
  $buildStart = [Diagnostics.ProcessStartInfo]::new()
  $buildStart.FileName = $nodePath
  $buildStart.Arguments = '"' + (Join-Path $projectPath 'build.mjs') + '"'
  $buildStart.WorkingDirectory = $projectPath
  $buildStart.UseShellExecute = $false
  $buildStart.EnvironmentVariables['EA_BUILD_DIR'] = Join-Path $projectPath 'local-dist'
  $buildStart.EnvironmentVariables['EA_SITE_ORIGIN'] = $siteUrl
  $buildStartAttempted = $true
  $buildProcess = [Diagnostics.Process]::Start($buildStart)
  if (-not $buildProcess) { throw 'Could not start the local build.' }
  $buildProcess.WaitForExit()
  if ($buildProcess.ExitCode -ne 0) { throw 'Build failed. Check content/*.json and the build output.' }

  # Do not attach to an old server, including one from this directory.
  Assert-PortAvailable $previewPort
  $logId = [guid]::NewGuid().ToString('N')
  $stdoutLog = Join-Path $logDirectory "launcher-$logId.stdout.log"
  $stderrLog = Join-Path $logDirectory "launcher-$logId.stderr.log"

  # Node loads this module before server.mjs, so only the child gets PORT.
  $portPreload = 'data:text/javascript,process.env.PORT%3D%22{0}%22' -f $portText
  $wait = [Diagnostics.Stopwatch]::StartNew()
  $serverStartAttempted = $true
  $serverProcess = Start-Process -FilePath $nodePath `
    -ArgumentList @('--import', $portPreload, ('"' + $serverPath + '"')) `
    -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  if (-not $serverProcess) { throw 'Could not start the local server.' }

  $serverMarker = @{
    format = 1; state = 'server'; projectPath = $projectPath; serverPath = $serverPath
    nodePath = $nodePath; pid = $serverProcess.Id; port = $previewPort
    startUtcTicks = $serverProcess.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
  }
  [IO.File]::WriteAllText($markerPath, ($serverMarker | ConvertTo-Json -Compress), [Text.Encoding]::UTF8)

  try {
    while ($wait.ElapsedMilliseconds -lt 15000) {
      $serverProcess.Refresh()
      if ($serverProcess.HasExited) { throw 'The local server exited before it became ready.' }
      if (-not $listenerJob) {
        $listenerJob = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $previewPort `
          -State Listen -OwningProcess $serverProcess.Id -AsJob -ErrorAction Stop
      }
      if ($listenerJob.State -in @('Completed', 'Failed', 'Stopped')) {
        $ownedListener = @(Receive-Job -Job $listenerJob -ErrorAction SilentlyContinue |
          Where-Object { $_.OwningProcess -eq $serverProcess.Id })
        Remove-Job -Job $listenerJob -Force -ErrorAction SilentlyContinue
        $listenerJob = $null
        $serverProcess.Refresh()
        if ($serverProcess.HasExited) { throw 'The local server exited before it became ready.' }
        if ($wait.ElapsedMilliseconds -ge 15000) { break }
        if ($ownedListener.Count -gt 0) { $ready = $true; break }
      }
      $remainingMilliseconds = 15000 - $wait.ElapsedMilliseconds
      if ($remainingMilliseconds -gt 0) {
        Start-Sleep -Milliseconds ([int][Math]::Min(200, $remainingMilliseconds))
      }
    }
    if (-not $ready) { throw 'The local server did not become ready within 15 seconds.' }
  } finally {
    if ($listenerJob) { Remove-Job -Job $listenerJob -Force -ErrorAction SilentlyContinue }
  }
} catch {
  $failure = $_.Exception.Message
  $childrenStopped = $true
  if ($serverStartAttempted) {
    if (-not $serverProcess -or -not (Stop-OwnedProcess $serverProcess)) { $childrenStopped = $false }
  }
  if ($buildStartAttempted) {
    if (-not $buildProcess -or -not (Stop-OwnedProcess $buildProcess)) { $childrenStopped = $false }
  }
  if ($markerOwned -and $childrenStopped) {
    try { [IO.File]::Delete($markerPath) }
    catch { Write-Warning "Could not remove the startup marker. $recoveryHint" }
  } elseif ($markerOwned) {
    Write-Warning "Could not confirm that all new child processes stopped. The startup marker was retained. $recoveryHint"
  }
  if ($serverStartAttempted) {
    $failure = "{0}{1}Server stdout log: {2}{1}Server stderr log: {3}" -f $failure, [Environment]::NewLine, $stdoutLog, $stderrLog
  }
  throw $failure
} finally {
  if ($buildProcess) { $buildProcess.Dispose() }
  if (-not $ready -and $serverProcess) { $serverProcess.Dispose() }
  if ($mutexAcquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}

try {
  $serverProcess.Refresh()
  if ($serverProcess.HasExited) {
    throw ("The local server exited after becoming ready.{0}Server stdout log: {1}{0}Server stderr log: {2}" -f [Environment]::NewLine, $stdoutLog, $stderrLog)
  }
  Write-Output "Local server ready: $siteUrl (PID $($serverProcess.Id))"
  Write-Output "Server logs: $stdoutLog ; $stderrLog"
  if ($wait.ElapsedMilliseconds -ge 15000) {
    Write-Warning "The readiness window has elapsed; open $siteUrl manually."
  } else {
    try { Start-Process $siteUrl }
    catch { Write-Warning "The browser could not be opened. Open $siteUrl manually." }
  }
} finally {
  $serverProcess.Dispose()
}
