# 对话手记

[English](README.en.md)

双人文字对话分析工具，支持 Windows 和 Android。

- 逐句查看情绪、意图、回复评价和表达建议，支持朋友、家庭、工作及恋爱等场景。
- 用文件夹整理对话，记录保存在本机，支持回收站恢复。
- 将选中的对话片段分享为图片或 TXT。

**软件免费；分析需要自备 API Key，模型调用费用由所选平台收取。**

## 下载与安装

[夸克网盘](https://pan.quark.cn/s/7894e2647abc?pwd=LQxA)（提取码 `LQxA`） · [GitHub 下载与更新说明](https://github.com/Alpasto-25/conversation-notes/releases/latest)

- **Windows**：下载安装包，或解压便携包后运行 `ConversationNotes.exe`。
- **Android 8.0+**：下载 APK 安装。

升级时直接覆盖安装；手机请勿先卸载，以保留设置和记录。Windows 支持 Windows 10 1809 / 11，需要 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

## 开始使用

1. 按首次使用引导配置 Jev 或 DeepSeek 的 API Key。
2. 粘贴或导入双人聊天文字，选择场景并确认哪个昵称是自己。
3. 点击分析查看结果；追加新聊天后可继续分析。

支持 TypeSafe、Vercel AI Gateway、OpenRouter 提供的 Jev，以及 DeepSeek 官方 API。配置页提供 Key 获取指引。

## 数据与隐私

电脑和手机各自保存记录与配置，不自动同步。分析时，必要对话内容会发送给所选模型平台；模型费用和数据规则以该平台为准。AI 解读仅供参考。

## 致谢

基于 [FerryCorleone/crush-monitor](https://github.com/FerryCorleone/crush-monitor)，感谢原作者和贡献者。本项目为非官方扩展，保留原 MIT 许可与署名。

[致谢与第三方许可](ACKNOWLEDGEMENTS.md) · [开发说明](docs/DEVELOPMENT.md) · [许可证](LICENSE)
