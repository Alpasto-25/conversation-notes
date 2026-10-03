# Conversation Notes (desktop and Android extension)

[简体中文](README.md) · English

> **Special thanks and primary credit to the original author, [FerryCorleone](https://github.com/FerryCorleone).**
> [crush-monitor](https://github.com/FerryCorleone/crush-monitor) supplied the original idea and the engineering foundation: conversation parsing, structured Jev judgments, emotion and intention displays, and reply evaluation. The author's excellent design and open-source contributions made this extension possible.

This is an unofficial fork, not a project independently created from scratch or an author-endorsed release. The original copyright and MIT license are preserved in full. See [Acknowledgements and contribution scope](ACKNOWLEDGEMENTS.md), and please support the upstream project.

The fork extends two-person conversations to general communication, new acquaintances, friends, family, coworkers, customers, romantic interest and partners, with additional import formats, a notebook UI, and local desktop/mobile packaging. Select a scene in the header or import dialog to analyze emotions, intentions, expression quality and next steps.

Non-romantic scenes evaluate engagement, understanding, respect, support, clarity and follow-through. Romantic scenes retain the original affection-signal dimensions. Scene selection alone does not call the model; click to analyze after switching. Existing conversation text stays in the same browser database, while results from the previous rubric need to be recalculated.

AI doesn't know your relationship or what happens outside the chat. Take the results lightly—as another perspective. Your own judgment and an honest conversation still matter more.

## Features

- **Conversation view:** analysis sits beneath each message. Paste text or import a UTF-8 `.txt`, `.md` or `.log` file.
- **Emotions and intentions:** the top three probabilities, with additional coordination, requirements, negotiation, follow-up and commitment categories. Non-romantic scenes exclude romantic-interest and flirting candidates.
- **Scene score and reply grades:** communication-state scores for ordinary scenes, affection signals for romantic scenes, SSS–D grades for your replies, and suggested next steps. Different scenes are not directly comparable.
- **Ongoing analysis:** paste more messages to continue. Overlapping excerpts are detected, long conversations run in batches, and results survive a page refresh.
- **Run locally with your own key:** choose TypeSafe, Vercel AI Gateway or OpenRouter and use your own API credits. No hosted deployment required.
- **First-run tutorial:** a skippable four-step guide, replayable from settings, plus provider-specific key and official billing instructions.

## Download and costs

Download this fork's Windows installer, portable ZIP, or Android APK from [Releases](https://github.com/Alpasto-25/conversation-notes/releases). These are this fork's builds, not releases by the upstream author. Windows x64 requires Windows 10 1809 / Windows 11 and Microsoft Edge WebView2; end users do not need Node. The Windows build is not commercially code-signed. Android 8.0+ builds use a local signing certificate and disable WebView debugging and USB config provisioning; they are not app-store releases. Check the release SHA256 values and keep system security protections enabled.

The Windows 1.1.0 installer and portable ZIP have been replaced in the same Release without changing the version number. The repair fixes native validation that incorrectly rejected normal chats and the default example as malformed. Install over the existing version; no chat reformatting or key re-entry is needed. Check the updated SHA256 values. Existing tags are not rewritten; use the repaired-source link in the Release notes for matching source. The Android APK is unchanged. See [CHANGELOG.md](CHANGELOG.md).

**The software is free. It does not offer recharge, top-ups, payment collection, payment processing, or API-key sales/giveaways.** Users obtain and manage their own keys from model providers or their official API platforms, and pay providers directly for model calls, credits, and recharge costs. Official links do not receive keys or conversation data. Viewing the guide does not call the model; connection tests and example analysis may incur provider costs. Free credits, pricing and account requirements can change; consult the provider's current official information.

Windows keys are encrypted with DPAPI and Android keys with Keystore. Installed desktop, browser and Android records remain separate. Windows updates preserve the established data directory; do not uninstall Android or clear its data before updating.

The interface and analysis labels are currently in Chinese. This README provides English setup instructions; it does not add an English UI.

WeChat, QQ and the documented WhatsApp text exports retain their parsers. Other messengers, email exchanges and interview transcripts can be formatted as `Name: message`. Only two-person text conversations are supported; group chats need to be reduced to a relevant two-person exchange, and images or audio need transcription first. This does not connect to messaging accounts or read their databases.

## Why Jev?

Jev is TypeSafe's model for structured judgments, returning classifications, scores and probabilities. This app needs short, per-message assessments rather than long generated answers. Emotion and intention judgments can also run in parallel within a request.

- [Launch post by founder Diogo Almeida](https://x.com/CompleteSkeptic/status/2099925682726002904)
- [Official introduction](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

## Get an API key

Choose **one** provider below. All three serve Jev; you do not need three accounts or a Vercel-hosted website.

| Provider | Create a key | Setup choice | Official credit / billing page |
| --- | --- | --- | --- |
| TypeSafe | Sign in to [API Keys](https://console.typesafe.ai/keys), create and securely save your key | `typesafe` | [Official console](https://console.typesafe.ai/); available credit/billing options depend on the current console |
| Vercel AI Gateway | Open [AI Gateway → API Keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys), select **Create key**; not an account Access Token | `vercel` | [AI Gateway](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway); use Credits at the top right |
| OpenRouter | Sign in to [API Keys](https://openrouter.ai/settings/keys), create a key and optionally set a limit | `openrouter` | [Settings → Credits](https://openrouter.ai/settings/credits) |

Make sure the account has available credits and Jev access. For Vercel account-verification 403 responses, follow its official account requirements yourself. This software never submits payment information on your behalf.

## Run locally

Install Node.js 22.12+. Download or clone this repository, then run these commands in the project directory. The same commands work on macOS, Windows and Linux.

```sh
npm ci
npm run setup -- --en
```

**Choose the provider, then paste its key.** Key input is hidden and saved in the local `.env`. The endpoint and model are set automatically. Setup sends one synthetic test request to verify the connection, using a small amount of API credits without reading your chats.

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3178/** and leave the terminal running. Next time, just run `npm start`. To change providers or keys, run setup again and restart the service; no rebuild is required.

<details>
<summary>Manual configuration / upgrading an existing installation</summary>

Alternatively, copy `.env.example` to `.env` and edit only these two lines:

```dotenv
JEV_PROVIDER=vercel
JEV_API_KEY=your_provider_key
```

Allowed providers: `typesafe`, `vercel`, `openrouter`. The key must belong to the selected provider. Do not add an API URL or model name. The old `TYPESAFE_API_KEY=...` configuration still works without changes when staying with TypeSafe.

`JEV_API_KEY` takes precedence. If unset, the selected provider uses `TYPESAFE_API_KEY`, `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY`, respectively. Credentials are never borrowed from a different provider. Shell environment variables take precedence over `.env`; remove stale shell settings if necessary.

</details>

Run `npm run check:api` to retry the connection test. For 401, check the key; 402, credits; 403, model permissions; 429, rate limits. For network errors, check connectivity to the selected provider. Setup reports saved configuration and successful verification separately.

## Usage

1. Copy your conversation, or open a text export and copy its contents. Paste into the input field.
2. Select your own name and click **开始分析** (Analyze). Relationship settings are available in **聊天设置** (Chat settings).
3. Read the emotion, intention and reply labels. Click a label for details.
4. Paste new messages to continue the conversation.

### Supported text formats

| Source | What to paste |
| --- | --- |
| WeChat | Desktop multi-message copy: name, Chinese date/time, then message body on separate lines |
| QQ | `Name: 09-17 19:26:53`, followed by the body on the next line; dates with a year also work |
| WhatsApp | [Export a chat](https://faq.whatsapp.com/1180414079177245/), open the `.txt` file and copy its contents; the two common layouts below are supported |
| iMessage / other apps | Format each message as `Name: body`; English names and names containing spaces work |

```text
[9/17/26, 7:26:53 PM] Alex: Dinner tonight?
[9/17/26, 7:27:00 PM] Me: Sounds good
```

```text
17/09/2026, 19:26 - Alex: Dinner tonight?
17/09/2026, 19:27 - Me: Sounds good
```

If copying from iMessage or another app gives you only the message bodies, add `Alex:` / `Me:` yourself. The app cannot recover missing sender information. Native iMessage bulk-copy compatibility has not been verified; only the manually labelled text format is supported. WhatsApp exports can vary by locale and version. The formats above have automated parser tests, not end-to-end verification on every client.

Multiline bodies and consecutive messages from the same person are preserved. Dates are kept as copied: the parser does not guess day/month order or missing years. Only two-person text conversations are supported—not images, audio, ZIP/HTML exports or chat databases. The app does not monitor messaging apps in the background.

## Notes

- In romantic scenes, the affection score combines six dimensions: keeping the conversation going, engagement, care, openness, intimacy and concrete actions. Click the score for a breakdown. An explicit refusal that still applies limits the score. **It is not the probability that someone likes you.**
- In non-romantic scenes, the communication score combines engagement, understanding, respect, support, clarity and follow-through. Reasonable boundaries do not trigger the romantic-refusal score cap; explicit limits still take priority in the next-step advice.
- Long conversations are processed in batches; the full history is not capped at 500 messages. New imports analyze new content and revisit recent messages from the other person. Previous grades for your own replies are retained.
- Scoring uses recent messages and relevant original excerpts from history, including invitations, care, refusals and retractions. Old scores are not evidence for new scores. Retrieval can miss context.
- Each model request stays within 500 messages and 12,000 text characters. Overlong individual messages are retained but need splitting before analysis. Paste at most 250,000 characters at a time; total history depends on browser storage capacity.
- Chats and results stay in this browser's local database. **清空聊天，重新开始** (Clear chat and start over) deletes them. Other browsers or URL ports do not share the same data; clearing browser data also removes it.
- Original messages needed for analysis are sent to your selected platform and its model provider using your account's credits. Local storage does not mean offline inference.
- If analysis fails, check the terminal, API key and account credits. Never commit `.env` or private conversations.

## Development

React + TypeScript + Vite + Express. The same emotion, intention and scoring rules run through three endpoints:

| Provider | API | Model |
| --- | --- | --- |
| TypeSafe | [System One](https://docs.typesafe.ai/api) | `jev-1.13.0` |
| Vercel | [TypeSafe-compatible API](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) | `typesafe-ai/jev` |
| OpenRouter | [Decisions (Alpha)](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request) | `typesafe/jev-1.13` |

Native Jev probabilities and confidence are preserved; Chat Completions is not used to simulate scores. Vercel manages its model alias, so the underlying version may change. Results are not guaranteed to be identical across providers. Offline tests cover all three adapters and the analysis pipeline. On 2026-09-22, a real Vercel account passed checks for all three question types, the affection overview, emotions, intentions and reply grades. OpenRouter has not yet been verified with a real account. Run `npm run check:api` to verify your own access.

```sh
npm run dev        # http://127.0.0.1:5178/
npm test           # local tests; no model calls
npm run check:api  # verify the selected provider; uses a small amount of API credits
npm run check:live # full analysis with sample chat; uses the selected provider's credits
```

## License

[MIT](LICENSE), with the upstream copyright and permission text preserved. See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md). No official affiliation with or endorsement by the upstream author, WeChat, Tencent, TypeSafe or any messaging platform mentioned here.
