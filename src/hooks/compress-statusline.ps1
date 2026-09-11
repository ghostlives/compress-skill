# compress statusline badge (Windows PowerShell counterpart to compress-statusline.sh).
# Reads session JSON from stdin, prints a badge for the active level, nothing when off.

$ErrorActionPreference = 'SilentlyContinue'

$ConfigDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$SessionsDirname = '.compress-sessions'
$ActiveFlag = Join-Path $ConfigDir '.compress-active'

$Input = ''
try {
    if ([Console]::IsInputRedirected) {
        $Input = [Console]::In.ReadToEnd()
    }
} catch { $Input = '' }

$SessionId = ''
if ($Input) {
    $m = [regex]::Match($Input, '"session_id"\s*:\s*"([A-Za-z0-9_-]{1,128})"')
    if ($m.Success) { $SessionId = $m.Groups[1].Value }
}

$Mode = ''
$SessionFile = Join-Path (Join-Path $ConfigDir $SessionsDirname) "$SessionId.mode"
if ($SessionId -and (Test-Path -LiteralPath $SessionFile)) {
    $Mode = (Get-Content -LiteralPath $SessionFile -Raw).Trim()
} elseif (Test-Path -LiteralPath $ActiveFlag) {
    $Mode = (Get-Content -LiteralPath $ActiveFlag -Raw).Trim()
}

if ($Mode -notin @('lite', 'full', 'ultra')) { exit 0 }

$orange = "$([char]27)[38;5;208m"
$reset = "$([char]27)[0m"

if ($Mode -eq 'full') {
    Write-Host -NoNewline "$orange[COMPRESS]$reset"
} else {
    Write-Host -NoNewline "$orange[COMPRESS:$($Mode.ToUpper())]$reset"
}
