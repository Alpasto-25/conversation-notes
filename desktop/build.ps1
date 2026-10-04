param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
# A Windows PowerShell child must not load PowerShell 7 binary modules.
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + [IO.Path]::PathSeparator + $env:PSModulePath
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspaceRoot = if ((Split-Path -Leaf (Split-Path -Parent $projectRoot)) -eq 'outputs') {
    [IO.Path]::GetFullPath((Join-Path $projectRoot '..\..'))
} else { $projectRoot }
$toolsRoot = Join-Path $workspaceRoot 'work\windows-tools'
$buildRoot = Join-Path $workspaceRoot ('work\windows-build\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$payload = Join-Path $buildRoot 'app'
$outputRoot = Join-Path $workspaceRoot 'outputs'
$webviewVersion = '1.0.4258.31'
$sdkRoot = Join-Path $toolsRoot "webview2-$webviewVersion"
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

New-Item -ItemType Directory -Force -Path $toolsRoot,$payload | Out-Null
if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework C# compiler not found.' }
if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll'))) {
    $sdkZip = Join-Path $toolsRoot "webview2-$webviewVersion.zip"
    & curl.exe -L --fail --silent --show-error --max-time 120 "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$webviewVersion/microsoft.web.webview2.$webviewVersion.nupkg" -o $sdkZip
    if ($LASTEXITCODE -ne 0) { throw 'WebView2 SDK download failed.' }
    Expand-Archive -LiteralPath $sdkZip -DestinationPath $sdkRoot -Force
}
$loader = Join-Path $sdkRoot 'runtimes\win-x64\native\WebView2Loader.dll'
$signature = Get-AuthenticodeSignature -LiteralPath $loader
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'WebView2 loader signature validation failed.' }

Push-Location $projectRoot
try {
    & npm.cmd run build -- --mode desktop
    if ($LASTEXITCODE -ne 0) { throw 'Desktop frontend build failed.' }
    & node --import tsx scripts/export-provider-links.ts $payload
    if ($LASTEXITCODE -ne 0) { throw 'Official provider link allowlist generation failed.' }
} finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist-desktop') -Destination (Join-Path $payload 'www') -Recurse
foreach ($assembly in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')) {
    Copy-Item -LiteralPath (Join-Path $sdkRoot "lib\net462\$assembly") -Destination $payload
}
Copy-Item -LiteralPath $loader -Destination $payload
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination (Join-Path $payload 'LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $sdkRoot 'LICENSE.txt') -Destination (Join-Path $payload 'WebView2-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $sdkRoot 'NOTICE.txt') -Destination (Join-Path $payload 'WebView2-NOTICE.txt')

# Render the existing notebook mark with Windows drawing APIs; no external assets.
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object Drawing.Bitmap(64,64)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::Transparent)
$paper = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(255,255,177,16))
$graphics.FillRectangle($paper,2,2,60,60)
$graphics.FillRectangle([Drawing.Brushes]::White,19,14,29,38)
$ink = New-Object Drawing.Pen([Drawing.Color]::FromArgb(255,17,17,17),3)
$graphics.DrawRectangle($ink,19,14,29,38)
$graphics.DrawLine($ink,26,14,26,52)
$graphics.DrawLine($ink,33,24,41,24)
$graphics.DrawLine($ink,33,33,41,33)
$graphics.DrawLine($ink,33,42,38,42)
$icon = [Drawing.Icon]::FromHandle($bitmap.GetHicon())
$iconFile = [IO.File]::Create((Join-Path $payload 'notebook.ico'))
try { $icon.Save($iconFile) } finally { $iconFile.Dispose(); $icon.Dispose(); $ink.Dispose(); $paper.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }

$references = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Net.Http.dll','System.Web.Extensions.dll','System.Security.dll') | ForEach-Object { "/reference:$_" }
$references += "/reference:$(Join-Path $payload 'Microsoft.Web.WebView2.Core.dll')"
$references += "/reference:$(Join-Path $payload 'Microsoft.Web.WebView2.WinForms.dll')"
$common = @('/nologo','/utf8output','/langversion:5','/platform:x64','/optimize+') + $references
$source = Join-Path $PSScriptRoot 'Main.cs'
$appExe = Join-Path $payload 'ConversationNotes.exe'
& $compiler @common /target:winexe "/out:$appExe" "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')" "/win32icon:$(Join-Path $payload 'notebook.ico')" $source
if ($LASTEXITCODE -ne 0) { throw 'Windows application compilation failed.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'App.config') -Destination "$appExe.config"

$testExe = Join-Path $payload 'DesktopTests.exe'
& $compiler @common /target:exe /main:ConversationNotes.DesktopTests "/out:$testExe" $source (Join-Path $PSScriptRoot 'Tests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Desktop tests compilation failed.' }
& $testExe (Join-Path $buildRoot 'unit-profile')
if ($LASTEXITCODE -ne 0) { throw 'Desktop offline tests failed.' }
# QA executable uses an explicitly separate profile and is never distributed.
$qaExe = Join-Path $payload 'ConversationNotes-QA.exe'
& $compiler @common /target:winexe /define:DESKTOP_QA "/out:$qaExe" "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')" $source
if ($LASTEXITCODE -ne 0) { throw 'Desktop QA application compilation failed.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'App.config') -Destination "$qaExe.config"
Move-Item -LiteralPath $testExe,$qaExe,"$qaExe.config" -Destination $buildRoot
# QA and unit harness share the same DLLs and assets without entering the payload.
foreach ($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','notebook.ico','official-links.json','www')) {
    Copy-Item -LiteralPath (Join-Path $payload $name) -Destination $buildRoot -Recurse
}
Write-Output "Native build and tests: $buildRoot"
if ($TestOnly) { return }

$innoRoot = Join-Path $toolsRoot 'inno-6.7.3'
$iscc = Join-Path $innoRoot 'ISCC.exe'
if (-not (Test-Path -LiteralPath $iscc)) {
    $innoInstaller = Join-Path $toolsRoot 'innosetup-6.7.3.exe'
    $innoSignature = if (Test-Path -LiteralPath $innoInstaller) { Get-AuthenticodeSignature -LiteralPath $innoInstaller } else { $null }
    if (-not $innoSignature -or $innoSignature.Status -ne 'Valid') {
        if (Get-Command gh.exe -ErrorAction SilentlyContinue) {
            & gh.exe release download is-6_7_3 --repo jrsoftware/issrc --pattern innosetup-6.7.3.exe --dir $toolsRoot --clobber
        } else {
            & curl.exe -L --fail --silent --show-error --max-time 300 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe' -o $innoInstaller
        }
        if ($LASTEXITCODE -ne 0) { throw 'Inno Setup download failed. Re-run after obtaining its official installer.' }
        $innoSignature = Get-AuthenticodeSignature -LiteralPath $innoInstaller
    }
    if ($innoSignature.Status -ne 'Valid' -or $innoSignature.SignerCertificate.Subject -notmatch 'Pyrsys') { throw 'Inno Setup signature validation failed.' }
    if ((Get-FileHash -LiteralPath $innoInstaller -Algorithm SHA256).Hash -ne '9C73C3BAE7ED48D44112A0F48E66742C00090BDB5BEF71D9D3C056C66E97B732') { throw 'Inno Setup official SHA256 mismatch.' }
    $toolInstall = Start-Process -FilePath $innoInstaller -ArgumentList @('/CURRENTUSER','/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/TASKS=',"/DIR=`"$innoRoot`"") -WindowStyle Hidden -Wait -PassThru
    if ($toolInstall.ExitCode -ne 0) { throw 'Inno Setup compiler installation failed.' }
}
Push-Location $projectRoot
try {
    & node --import tsx scripts/audit-desktop.mjs $payload
    if ($LASTEXITCODE -ne 0) { throw 'Desktop credential audit failed.' }
} finally { Pop-Location }
$chineseLanguage = Join-Path $toolsRoot 'ChineseSimplified.isl'
if (-not (Test-Path -LiteralPath $chineseLanguage)) {
    # Official Inno translation, pinned to a repository revision and SHA256.
    & curl.exe -L --fail --silent --show-error --max-time 60 'https://api.github.com/repos/jrsoftware/issrc/contents/Files/Languages/ChineseSimplified.isl?ref=283ab9ca32b52d2367640d34fcc5c3e6274be116' -H 'Accept: application/vnd.github.raw+json' -o $chineseLanguage
    if ($LASTEXITCODE -ne 0) { throw 'Chinese installer translation download failed.' }
}
if ((Get-FileHash -LiteralPath $chineseLanguage -Algorithm SHA256).Hash -ne 'E0B0B350E2245F3C5E65586DFE43D574F6E7F06F2261149ABA284954B3FC9A8D') { throw 'Chinese installer translation SHA256 mismatch.' }
& $iscc "/DPayload=$payload" "/DOutput=$outputRoot" "/DChineseLanguage=$chineseLanguage" (Join-Path $PSScriptRoot 'installer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Windows installer compilation failed.' }
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath (Join-Path $outputRoot 'ConversationNotes-Portable-1.1.2-x64.zip') -Force
Write-Output "Installer: $(Join-Path $outputRoot 'ConversationNotes-Setup-1.1.2-x64.exe')"
