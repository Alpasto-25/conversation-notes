# Conversation Notes

[简体中文](README.md)

A two-person text conversation analyzer for Windows and Android.

- Read message-by-message emotions, intentions, reply feedback, and suggestions across everyday, family, work, and relationship conversations.
- Organize local notes in folders and recover deleted notes from the recycle bin.
- Share selected messages as images or TXT files.
- Enable optional expression and subtext analysis with DeepSeek alone or Jev + DeepSeek.
- View concise usage and estimated DeepSeek costs.

**The software is free. Bring your own API key; your selected provider charges for model calls.**

## Download and install

[Latest GitHub release](https://github.com/Alpasto-25/conversation-notes/releases/latest) · [Quark mirror](https://pan.quark.cn/s/7894e2647abc?pwd=LQxA) (code: LQxA)

**Download 1.1.4 from GitHub.**

- **Windows:** run the installer, or extract the portable ZIP and run ConversationNotes.exe.
- **Android 8.0+:** install the APK.

Update over the existing installation. Do not uninstall on Android first, so your records and settings remain. Windows 10 1809 / 11 requires [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

## Get started

1. Follow the first-run guide to configure a Jev or DeepSeek API key.
2. Paste or import a two-person text chat, choose the scene, and identify your nickname.
3. Start analysis and read the results. You can continue after adding new messages.

Supports Jev through TypeSafe, Vercel AI Gateway, or OpenRouter, and the official DeepSeek API. The configuration page includes key setup instructions.

Expression and subtext explanations require DeepSeek. In Jev + DeepSeek mode, Jev makes the judgments and DeepSeek explains them; in DeepSeek-only mode, DeepSeek handles both. Detailed Jev usage is unavailable. DeepSeek cost estimates are for reference; your provider's bill applies.

## Data and privacy

Each device stores its own records and settings, without automatic synchronization. Analysis sends the necessary conversation content to your selected provider. Its pricing and data policies apply. AI interpretations are for reference.

## Credits

Based on [FerryCorleone/crush-monitor](https://github.com/FerryCorleone/crush-monitor), with thanks to its author and contributors. This is an unofficial extension; upstream MIT licensing and attribution are preserved.

[Credits and third-party licenses](ACKNOWLEDGEMENTS.md) · [Development](docs/DEVELOPMENT.md) · [License](LICENSE)
