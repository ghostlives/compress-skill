# compress installer shim. All logic lives in bin/install.js.
$ErrorActionPreference = 'Stop'

$Self = $MyInvocation.MyCommand.Path
if ($Self) {
    $Dir = Split-Path -Parent $Self
    $Local = Join-Path $Dir 'bin/install.js'
    if (Test-Path -LiteralPath $Local) {
        & node $Local @args
        exit $LASTEXITCODE
    }
}

$Repo = if ($env:COMPRESS_REPO) { $env:COMPRESS_REPO } else { 'ghostlives/compress-skill' }
& npx -y "github:$Repo" -- @args
exit $LASTEXITCODE
