$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodePath = $nodeCommand.Source }
else { $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 24 or newer.' }
if ([int]((& $nodePath --version).TrimStart('v').Split('.')[0]) -lt 24) { throw 'Node.js 24 or newer is required for local inquiry storage.' }
& $nodePath (Join-Path $PSScriptRoot 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Check content/*.json.' }
$previewPort = if ($env:PORT) { [int]$env:PORT } else { 8781 }
$listener = Get-NetTCPConnection -LocalPort $previewPort -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $owner = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener[0].OwningProcess)
  if (-not $owner.CommandLine.Contains((Join-Path $PSScriptRoot 'server.mjs'))) { throw "Port $previewPort is used by another program. Set a different PORT." }
} else {
  Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
}
Start-Process "http://127.0.0.1:$previewPort"
