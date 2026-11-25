param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$node = Join-Path $PSScriptRoot 'node.exe'
if (!(Test-Path -LiteralPath $node)) { $node = (Get-Command node.exe).Source }
. (Join-Path $PSScriptRoot 'tls.ps1')
$server = Join-Path $PSScriptRoot 'serve.mjs'
if (!$env:STUDY_DATA) { $env:STUDY_DATA = Join-Path $env:LOCALAPPDATA 'ScreenStudy\data' }
[void][IO.Directory]::CreateDirectory($env:STUDY_DATA)

$control = Join-Path $env:STUDY_DATA 'control.url'
$hash = [Security.Cryptography.SHA256]::Create()
$instance = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:STUDY_DATA)))
$mutex = [Threading.Mutex]::new($false, 'Local\ScreenStudy-' + $instance)
$ownsMutex = $false
try {
    try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (!$ownsMutex) {
        if (!$NoBrowser) {
            for ($attempt = 0; $attempt -lt 25; $attempt++) {
                if (Test-Path -LiteralPath $control) {
                    $url = [IO.File]::ReadAllText($control)
                    if ($url -match '^http://127\.0\.0\.1:\d+/#[-_\w]{32}$') {
                        Start-Process $url
                        break
                    }
                }
                Start-Sleep -Milliseconds 200
            }
        }
        exit 0
    }
    if (Test-Path -LiteralPath $control) { [IO.File]::Delete($control) }
    $env:STUDY_CONTROL = $control
    $seedFile = Join-Path $env:STUDY_DATA 'pair.seed'
    if (!(Test-Path -LiteralPath $seedFile)) {
        $random = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $bytes = New-Object byte[] 32
            $random.GetBytes($bytes)
            [IO.File]::WriteAllText($seedFile, [Convert]::ToBase64String($bytes))
        } finally { $random.Dispose() }
    }
    $env:STUDY_PAIR_SEED = [IO.File]::ReadAllText($seedFile)
    $addresses = @(& $node $server --lan-addresses | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })
    if ($addresses.Count) {
        $session = Join-Path $env:STUDY_DATA ([Guid]::NewGuid().ToString('N'))
        [void][IO.Directory]::CreateDirectory($session)
        try {
            New-ScreenStudyTls $env:STUDY_DATA $session $addresses
        } catch {
            $env:STUDY_SETUP_ERROR = $_.Exception.Message
            Remove-Item Env:STUDY_TLS_CERT,Env:STUDY_TLS_ROOT,Env:STUDY_TLS_KEY -ErrorAction SilentlyContinue
        }
    }
    $arguments = @($server)
    if (!$NoBrowser) { $arguments += '--open' }
    & $node @arguments
    if ($LASTEXITCODE -ne 0) { throw "ScreenStudy exited with code $LASTEXITCODE." }
} catch {
    if (!$NoBrowser) {
        Add-Type -AssemblyName System.Windows.Forms
        [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'ScreenStudy')
    }
    throw
} finally {
    if ($ownsMutex) {
        if (Test-Path -LiteralPath $control) { [IO.File]::Delete($control) }
        if ($session -and [IO.Directory]::Exists($session)) {
            [IO.File]::Delete((Join-Path $session 'server.cer'))
            [IO.File]::Delete((Join-Path $session 'server-key.json'))
            [IO.File]::Delete((Join-Path $session 'root.cer'))
            [IO.Directory]::Delete($session)
        }
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
