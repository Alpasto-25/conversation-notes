# Windows desktop packaging

`npm run build:desktop` produces a per-user Inno Setup installer and a portable ZIP in the workspace's `outputs` directory. Requires Windows x64, Node for building, .NET Framework's C# compiler, and network access on the first build. End users do not need Node, npm, Express, a terminal, or the source checkout.

The .NET Framework WinForms host uses the system's Evergreen WebView2 runtime and serves bundled Vite assets under `https://notebook.local`. The existing shared analysis engine runs in the page; only fixed-provider HTTPS transport runs natively. The desktop and Android hosts use the same `DialogueNative` request/resolve protocol.

Only `status`, `configure`, `importConfig`, `evaluate`, `openExternal`, and cancellation are exposed. `openExternal` accepts only the exact fixed official provider URLs exported from `shared/provider-guides.ts` into `official-links.json`; it opens the system browser without adding keys or conversation content. Arbitrary links, embedded navigation, new WebView windows, remote browser resources, browser permissions, password saving and production DevTools remain blocked. CSP blocks page network access; API errors never include upstream bodies. Model requests have bounded concurrency, budgets, timeout, cancellation and at most one short retry.

Version 1.1.0 adds a four-step first-run guide, optional dismissal, help replay from settings/sidebar, and provider-specific API key and official billing tutorials. The guide's completion flag is stored in this profile's localStorage without modifying the established record storage or encrypted config. The app is free and does not offer recharge, payment, key sales or credit purchases. Users obtain and manage their own keys with providers and pay any model/credit costs directly; viewing the guide never calls the model.

API configuration is protected by Windows DPAPI for the current user and stored outside the install directory at `%LOCALAPPDATA%/ConversationNotes/config.dpapi`. No default key is packaged, returned by `status`, or copied from `.env` during building. Import requires choosing a file in the native dialog. It reads recognized environment variables without modifying the source.

IndexedDB retains the established database/store/key and rubric. Its profile is `%LOCALAPPDATA%/ConversationNotes/WebView`. It is separate from the old browser's profile and the Android app, not automatically synchronized. Reinstallation and uninstall preserve user data. The portable ZIP uses the same stable user data location as the installed app.

`npm run test:desktop` builds the native host and runs offline C# transport/storage checks without producing an installer. Additional QA executables are compiled with `DESKTOP_QA` and require an explicitly isolated profile; they are never included in the install payload. Real provider authorization rejection can be tested with a synthetic invalid key, without using a user's quota. Full scoring UI tests use an offline evaluation fixture.

There is no auto-updater, background service or automatic access to other apps. This is a local, unsigned self-use build, not a store release. The installer checks that WebView2 is present and does not bundle or silently install the browser runtime.
