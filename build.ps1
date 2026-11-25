param(
    [string]$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source,
    [string]$NodeLicense = (Join-Path $PSScriptRoot 'NODE-LICENSE.txt'),
    [string]$Output = (Join-Path $PSScriptRoot 'dist')
)
$ErrorActionPreference = 'Stop'
$arch = & $NodeExe -p 'process.arch'
if ($LASTEXITCODE -ne 0 -or $arch -ne 'x64') { throw 'Provide a Windows x64 Node.js 24 executable.' }
$version = & $NodeExe -p 'process.versions.node'
if ($version -ne '24.19.0') { throw 'Provide Node.js 24.19.0 to match NODE-LICENSE.txt.' }
$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$build = Join-Path ([IO.Path]::GetTempPath()) ('ScreenStudyBuild-' + [Guid]::NewGuid().ToString('N'))
$payload = Join-Path $build 'payload'
New-Item -ItemType Directory -Force -Path $payload,$Output | Out-Null
try {
    & $NodeExe (Join-Path $PSScriptRoot 'prepare-ocr.mjs')
    if ($LASTEXITCODE) { throw 'OCR assets are missing. Run npm ci before building.' }
    $appFiles = @('index.html','desktop.html','desktop.js','banks.mjs','serve.mjs','start.ps1','tls.ps1','qrcode.js','QRCODE-LICENSE.txt')
    foreach ($file in $appFiles) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $payload }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ocr') -Destination $payload -Recurse
    Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $payload 'node.exe')
    Copy-Item -LiteralPath $NodeLicense -Destination (Join-Path $payload 'NODE-LICENSE.txt')
    $launcher = Join-Path $payload 'ScreenStudy.exe'
    & $csc /nologo /codepage:65001 /target:winexe /platform:x64 /reference:System.Windows.Forms.dll "/out:$launcher" (Join-Path $PSScriptRoot 'Launcher.cs')
    if ($LASTEXITCODE) { throw 'Launcher build failed.' }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = Join-Path $build 'payload.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($payload, $zip)
    $setup = Join-Path $Output 'ScreenStudy-Setup-v0.1.2-x64.exe'
    & $csc /nologo /codepage:65001 /target:winexe /platform:x64 /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:Microsoft.CSharp.dll "/out:$setup" "/resource:$zip,payload.zip" (Join-Path $PSScriptRoot 'Setup.cs')
    if ($LASTEXITCODE) { throw 'Setup build failed.' }
    Get-Item -LiteralPath $setup
} finally {
    [IO.Directory]::Delete($build, $true)
}
