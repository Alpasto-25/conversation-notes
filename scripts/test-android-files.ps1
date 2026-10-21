$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$javaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$classesRoot = Join-Path $projectRoot ('work\android-file-tests\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Force -Path $classesRoot | Out-Null
$sources = @('android\src\local\conversation\notes\ExportData.java','android\src\local\conversation\notes\BackupTransfer.java','tests\AndroidExportTests.java','tests\BackupTransferTests.java') | ForEach-Object { Join-Path $projectRoot $_ }
& (Join-Path $javaRoot 'bin\javac.exe') --release 11 -encoding UTF-8 -d $classesRoot @sources
if ($LASTEXITCODE -ne 0) { throw 'Android file validation compilation failed.' }
foreach ($className in @('local.conversation.notes.AndroidExportTests','local.conversation.notes.BackupTransferTests')) {
    & (Join-Path $javaRoot 'bin\java.exe') -cp $classesRoot $className
    if ($LASTEXITCODE -ne 0) { throw 'Android file validation failed.' }
}
