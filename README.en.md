# Conversation Notes

Version 1.1.2 adds a startup dialog when a verified update is available and a saved appearance choice (System / Light / Dark). It includes the mobile drawer, analysis-preserving reading view, scene-result cache, and DeepSeek Flash / Pro fixes developed since 1.1.2. Update checks do not call a model or install anything automatically.

[简体中文](README.md)

A local-first tool for two-person text conversations: emotions, intentions, expression quality, and next-step suggestions for everyday, family, work, customer, and romantic communication. Windows and Android apps; the UI is currently in Chinese.

> **Primary credit and special thanks to [FerryCorleone](https://github.com/FerryCorleone) and the contributors for their excellent work.** The original [crush-monitor](https://github.com/FerryCorleone/crush-monitor) supplied the idea, conversation parser, and Jev analysis foundation. This is an unofficial fork, not an author-endorsed release. The upstream MIT license is preserved; see [Acknowledgements](ACKNOWLEDGEMENTS.md).

## Download

Get packages from the [latest Release](https://github.com/Alpasto-25/conversation-notes/releases/latest):

- Windows installer: `ConversationNotes-Setup-1.1.2-x64.exe`.
- Windows portable: extract `ConversationNotes-Portable-1.1.2-x64.zip` and run `ConversationNotes.exe`.
- Android 8.0+: `conversation-notes-1.1.2.apk`.

Windows requires Windows 10 1809 / Windows 11 and [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/); Node.js is not needed. Windows packages are not commercially code-signed; Android uses a local signing certificate. Check the Release SHA256 values and keep security protections enabled. Install updates over the existing app; do not uninstall Android first.

## Use

1. Follow the first-run guide to select a provider and enter its API key. Settings include key and official billing instructions.
2. Choose a scene, paste or import text, and identify your own name.
3. Click “开始分析” (Analyze); add more messages to continue.

Conversation folders group separate notebooks by scene and person. Creating a notebook keeps previous records; switching restores saved text and analysis without model calls. Imports can also be saved without analysis.

Organize names, contacts and scenes, sort notebooks, and keep collapsed-group preferences. Deleted notebooks go to a recoverable recycle bin. Single-message deletion requires confirmation and clears analysis that could depend on the removed context, without automatically rerunning it. The desktop layout expands with a maximized window.

Version 1.1.2 tightens emotion / intent tags and the expression / next-step bar without changing typography or colors. The expand button opens chat and analysis together: emotion, intent, reply ratings and the bottom analysis bar remain visible and open their existing detail dialogs. The same button restores the normal layout and the previous reading position. This reuses the chat list, preserves drafts, and makes no automatic model calls. Android Back and Esc can also exit reading mode.

WeChat, QQ, and common WhatsApp text formats are supported. For other sources, use:

```text
Me: Can we discuss the plan tomorrow afternoon?
Alex: Yes, at three.
```

Two-person text only. The app does not connect to messaging accounts or read their databases; transcribe images/audio first.

“版本与更新” (Version and updates) shows a red dot for a confirmed update, with manual checks and a Release link. Dismissing a reminder does not clear the dot. Optional automatic checks run on launch and every six hours while open. No automatic download/install or background checks after exit.

## API and costs

Choose [TypeSafe](https://console.typesafe.ai/keys), [Vercel AI Gateway](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys), [OpenRouter](https://openrouter.ai/settings/keys), or [DeepSeek](https://platform.deepseek.com/api_keys). Use a key from the selected provider.

Version 1.1.2 adds DeepSeek Flash / Pro and a quick model selector beside the analysis scene. Each provider's key is encrypted locally and retained when switching; existing Jev settings remain compatible. Switching does not call a model or erase previous results. It affects future analyses. Model latency, results and prices vary; network conditions and provider load also affect response time.

DeepSeek Flash / Pro use JSON mode with a the full list of allowed keys per question, preventing event and intent candidates from being mixed. The app normalizes relative candidate weights into probabilities and scores, so long imported records no longer depend on manually summed probabilities or positional arrays. Missing questions, unknown candidates with nonzero weight, all-zero or invalid weights remain rejected. Invalid sub-answers get one targeted JSON-mode repair with valid answers retained and actual usage added; a failed repair reports an error and keeps completed progress. Zero placeholders have no effect on scores and earlier response formats remain compatible. Mobile empty cards no longer scroll internally or reserve space for the chat expand button; short screens scroll the whole page, and imported conversations retain the existing chat scroller.

**The software is free and offers no recharge, payments, or key sales. Users obtain their own keys and pay model providers directly for API calls and credits.** Analysis, examples, and connection tests may spend credits; free allowances, pricing, and model access depend on the provider.

## Privacy

Records stay on your device, but excerpts needed for analysis are sent to the selected model provider. Use only content you may share; never publish keys or private chats. AI results are only a reference. Desktop, Android, and browser data are separate, not synchronized; uninstalling Android or clearing its data removes records and configuration.

<details>
<summary>Run from source / development</summary>

Requires Node.js 22.12+. In the project directory:

```sh
npm ci
npm run setup -- --en
npm run build
npm start
```

Open http://127.0.0.1:3178/ and keep the terminal running. Next time, run `npm start`; stop with Ctrl+C. Browser-version configuration is stored in the local `.env`; never commit it.

Development: `npm run dev`; offline tests: `npm test`; packages: `npm run build:desktop` / `npm run build:android`.

</details>

[Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Windows build](desktop/README.md) · [Update protocol](docs/UPDATES.md) · [MIT license](LICENSE)
