param([switch]$Install)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$TaskRoot = if ((Split-Path -Leaf (Split-Path -Parent $ProjectRoot)) -eq 'outputs') {
    [IO.Path]::GetFullPath((Join-Path $ProjectRoot '..\..'))
} else { $ProjectRoot }
$SdkRoot = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$JavaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$BuildTools = Join-Path $SdkRoot 'build-tools\36.0.0'
$AndroidJar = Join-Path $SdkRoot 'platforms\android-36\android.jar'
$BuildStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$ArchiveRoot = [IO.Path]::GetFullPath((Join-Path $TaskRoot ('work\android-build\build-' + $BuildStamp)))
# Windows aapt2/zipalign cannot reliably open Chinese paths. Keep their
# intermediate inputs in TEMP, then retain the finished build in the project.
$BuildRoot = if ($TaskRoot -match '[^\x00-\x7F]') {
    [IO.Path]::GetFullPath((Join-Path $env:TEMP ('conversation-notes-android-' + $BuildStamp)))
} else { $ArchiveRoot }
if ($BuildRoot -match '[^\x00-\x7F]') { throw 'Android build tools require an ASCII TEMP path.' }
$SigningRoot = Join-Path $TaskRoot 'work\android-signing'
$SigningKey = Join-Path $SigningRoot 'notebook-local.jks'
$ApkPath = Join-Path $TaskRoot 'outputs\conversation-notes-1.1.2.apk'
$Adb = Join-Path $SdkRoot 'platform-tools\adb.exe'
foreach ($RequiredPath in @($AndroidJar, (Join-Path $JavaRoot 'bin\javac.exe'), (Join-Path $BuildTools 'aapt2.exe'))) {
    if (-not (Test-Path -LiteralPath $RequiredPath)) { throw "Missing Android build dependency: $RequiredPath" }
}
$env:JAVA_HOME = $JavaRoot
$env:PATH = (Join-Path $JavaRoot 'bin') + ';' + $env:PATH
function Assert-ToolSuccess($Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit $LASTEXITCODE)" } }
Push-Location $ProjectRoot
try {
    & npm.cmd run build:mobile
    Assert-ToolSuccess 'Mobile web build'
    foreach ($Directory in @($BuildRoot, $SigningRoot, (Join-Path $BuildRoot 'assets\www'), (Join-Path $BuildRoot 'generated'), (Join-Path $BuildRoot 'classes'), (Join-Path $BuildRoot 'dex'))) {
        New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    }
    & node --import tsx scripts/export-provider-links.ts (Join-Path $BuildRoot 'assets')
    Assert-ToolSuccess 'Official provider link allowlist'
    Copy-Item -LiteralPath (Join-Path $ProjectRoot 'LICENSE') -Destination (Join-Path $BuildRoot 'assets\LICENSE.txt')
    Copy-Item -LiteralPath (Join-Path $ProjectRoot 'ACKNOWLEDGEMENTS.md') -Destination (Join-Path $BuildRoot 'assets\ACKNOWLEDGEMENTS.md')
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'dist-mobile') | Copy-Item -Destination (Join-Path $BuildRoot 'assets\www') -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'res') -Destination (Join-Path $BuildRoot 'res') -Recurse
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AndroidManifest.xml') -Destination (Join-Path $BuildRoot 'AndroidManifest.xml')
    & (Join-Path $BuildTools 'aapt2.exe') compile --dir (Join-Path $BuildRoot 'res') -o (Join-Path $BuildRoot 'compiled.zip')
    Assert-ToolSuccess 'Android resources'
    & (Join-Path $BuildTools 'aapt2.exe') link -o (Join-Path $BuildRoot 'base.apk') --manifest (Join-Path $BuildRoot 'AndroidManifest.xml') --java (Join-Path $BuildRoot 'generated') -I $AndroidJar --auto-add-overlay (Join-Path $BuildRoot 'compiled.zip')
    Assert-ToolSuccess 'Android resource package'
    $JavaSources = @((Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src') -Recurse -Filter '*.java').FullName) + @((Get-ChildItem -LiteralPath (Join-Path $BuildRoot 'generated') -Recurse -Filter '*.java').FullName)
    & (Join-Path $JavaRoot 'bin\javac.exe') --release 11 -encoding UTF-8 -classpath $AndroidJar -d (Join-Path $BuildRoot 'classes') @JavaSources
    Assert-ToolSuccess 'Java compilation'
    & (Join-Path $JavaRoot 'bin\jar.exe') --create --file (Join-Path $BuildRoot 'classes.jar') -C (Join-Path $BuildRoot 'classes') .
    Assert-ToolSuccess 'Java archive'
    & (Join-Path $BuildTools 'd8.bat') --min-api 26 --lib $AndroidJar --output (Join-Path $BuildRoot 'dex') (Join-Path $BuildRoot 'classes.jar')
    Assert-ToolSuccess 'Android bytecode'
    Copy-Item -LiteralPath (Join-Path $BuildRoot 'base.apk') -Destination (Join-Path $BuildRoot 'unaligned.apk')
    # aapt2 on Windows can write backslashes in -A entries. Java's ZIP writer
    # normalizes separators, so AssetManager sees the same paths on Android.
    & (Join-Path $JavaRoot 'bin\jar.exe') --update --file (Join-Path $BuildRoot 'unaligned.apk') -C $BuildRoot assets -C (Join-Path $BuildRoot 'dex') classes.dex
    Assert-ToolSuccess 'APK assembly'
    & (Join-Path $BuildTools 'zipalign.exe') -p -f 4 (Join-Path $BuildRoot 'unaligned.apk') (Join-Path $BuildRoot 'aligned.apk')
    Assert-ToolSuccess 'APK alignment'
    if (-not (Test-Path -LiteralPath $SigningKey)) {
        & (Join-Path $JavaRoot 'bin\keytool.exe') -genkeypair -keystore $SigningKey -storepass android -keypass android -alias notebook-local -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Conversation Notes Local,OU=Personal Development,O=Local,C=CN' -storetype JKS
        Assert-ToolSuccess 'Local signing key'
    }
    & (Join-Path $BuildTools 'apksigner.bat') sign --ks $SigningKey --ks-key-alias notebook-local --ks-pass pass:android --key-pass pass:android --out $ApkPath (Join-Path $BuildRoot 'aligned.apk')
    Assert-ToolSuccess 'APK signing'
    & (Join-Path $BuildTools 'apksigner.bat') verify $ApkPath
    Assert-ToolSuccess 'APK signature verification'
    & node --import tsx (Join-Path $ProjectRoot 'scripts\audit-android.mjs') $ApkPath
    Assert-ToolSuccess 'APK secret and asset audit'
    if ($BuildRoot -ne $ArchiveRoot) {
        $TempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
        if (!$BuildRoot.StartsWith($TempRoot + '\conversation-notes-android-', [StringComparison]::OrdinalIgnoreCase) -or
            !$ArchiveRoot.StartsWith([IO.Path]::GetFullPath($TaskRoot) + '\work\android-build\', [StringComparison]::OrdinalIgnoreCase) -or
            (Test-Path -LiteralPath $ArchiveRoot)) { throw 'Unexpected Android build archive paths.' }
        New-Item -ItemType Directory -Path (Split-Path -Parent $ArchiveRoot) -Force | Out-Null
        Move-Item -LiteralPath $BuildRoot -Destination $ArchiveRoot
    }
    Write-Output "APK ready: $ApkPath"
    if ($Install) {
        & $Adb -d install -r $ApkPath
        Assert-ToolSuccess 'Phone installation'
        & $Adb -d shell am start -n local.conversation.notes/.MainActivity
        Assert-ToolSuccess 'Phone launch'
    }
} finally { Pop-Location }
