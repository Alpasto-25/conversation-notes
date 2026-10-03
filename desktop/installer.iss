#ifndef Payload
  #error Payload must be supplied by desktop/build.ps1
#endif

[Setup]
AppId={{BD168B27-1BA2-4D37-9498-5AACBE7583A2}
AppName=对话手记
AppVersion=1.1.1
AppPublisher=Conversation Notes Local
DefaultDirName={localappdata}\Programs\ConversationNotes
DefaultGroupName=对话手记
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#Output}
OutputBaseFilename=ConversationNotes-Setup-1.1.1-x64
SetupIconFile={#Payload}\notebook.ico
UninstallDisplayIcon={app}\ConversationNotes.exe
UninstallDisplayName=对话手记
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
LicenseFile={#Payload}\LICENSE.txt
InfoBeforeFile=install-info.txt

[Languages]
Name: "chinesesimplified"; MessagesFile: "{#ChineseLanguage}"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式 / Create a desktop shortcut"; Flags: checkedonce

[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\对话手记"; Filename: "{app}\ConversationNotes.exe"
Name: "{autodesktop}\对话手记"; Filename: "{app}\ConversationNotes.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ConversationNotes.exe"; Description: "打开对话手记 / Launch Conversation Notes"; Flags: nowait postinstall skipifsilent

; User data lives outside {app}. Updates and uninstall do not delete it.
[Code]
function InitializeSetup(): Boolean;
var
  RuntimeVersion: String;
begin
  Result := RegQueryStringValue(HKLM64,
    'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', RuntimeVersion)
    or RegQueryStringValue(HKLM32,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', RuntimeVersion)
    or RegQueryStringValue(HKCU,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', RuntimeVersion);
  if not Result then
    MsgBox('需要 Microsoft Edge WebView2 Runtime。请先从微软官网安装，然后重新运行此安装包。 / Install Microsoft Edge WebView2 Runtime first: https://developer.microsoft.com/microsoft-edge/webview2/', mbError, MB_OK);
end;
