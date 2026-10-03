# 对话手记（桌面与 Android 本机版）

简体中文 · [English](README.en.md)

> **首先向原作者 [FerryCorleone](https://github.com/FerryCorleone) 致以特别感谢。**
> 原项目 [crush-monitor](https://github.com/FerryCorleone/crush-monitor) 的原创构想，以及对话解析、Jev 结构化模型调用、情绪与意图呈现和回复评价的工程实现，是本扩展能够成立的基础。原作者卓越的设计与开源贡献应当获得首要认可。

这是原项目的非官方扩展版，不是从零独立创作，也不代表原作者为本 Fork 的改动或安装包背书。原作者版权声明与 MIT 许可证完整保留；详细归属见 [致谢与贡献说明](ACKNOWLEDGEMENTS.md)。欢迎优先了解并支持原项目。

在上述基础上，本 Fork 扩展了双人对话的使用场景、文本导入、界面和电脑 / 手机本机应用。支持通用沟通、刚认识、朋友、家人、同事、客户、暧昧和恋爱八种场景，查看情绪、意图、自己的表达质量与下一步建议。

在顶部或导入确认框选择场景。普通场景使用回应投入、理解确认、尊重边界、支持配合、表达清晰、行动跟进六项沟通指标；暧昧和恋爱场景保留原来的好感信号指标。工作中的简洁、家庭中的自主边界和客户的礼貌不会自动被解释成恋爱信号。

不过，AI 不知道你们现实中怎么相处，也不了解聊天之外的故事。分析结果就当图一乐、做个参考。怎么理解对方、怎么表达自己，最后还是得靠自己的感受和真诚。

## 特点

- **对话视图**：聊天气泡下直接展示分析，可粘贴内容或导入 UTF-8 的 `.txt`、`.md`、`.log` 文本文件。
- **情绪与意图**：分别展示概率最高的三项；新增协调分工、说明需求、协商条件、跟进进展和承诺行动。非恋爱场景不提供调情或试探恋爱好感的判断候选。
- **场景评分与回复评级**：顶部显示沟通状态或好感信号，自己的表达按 SSS 到 D 分档，并给出下一步建议。
- **连续分析**：继续粘贴新记录即可更新，识别重复片段，自动分批处理长记录；已分析内容保存在本机，刷新后可以继续。
- **本机运行，自带 Key**：无需服务器，支持 TypeSafe 官方、Vercel AI Gateway 和 OpenRouter，使用自己的 Key 和额度。
- **首次使用引导**：四步教程可以跳过，也可以从设置重看；API 配置提供对应平台的 Key 获取教程和官方额度 / 充值入口。
- **版本与更新**：顶部、侧栏或设置可打开 Release 下载页，支持自动提醒和手动检查；同版本的新构建也能识别，不会自动下载或安装。

## 下载与安装

从本 Fork 的 [Releases](https://github.com/Alpasto-25/conversation-notes/releases) 下载。安装包是本 Fork 的构建，不是原作者发布的安装包。

- Windows x64：`ConversationNotes-Setup-1.1.0-x64.exe`。安装后从桌面或开始菜单打开，无需 Node.js 或本地网页服务。要求 Windows 10 1809 / Windows 11 和 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。本安装包没有商业代码签名，可能显示未知发布者，请核对 Release 中的 SHA256；不要关闭系统安全防护。
- Windows 便携包：`ConversationNotes-Portable-1.1.0-x64.zip`。完整解压，运行 `ConversationNotes.exe`。
- Android 8.0+：`conversation-notes-1.1.0.apk`。使用本地自用证书签名，非应用商店发行；公开构建关闭 WebView 远程调试和 USB 配置迁入。请只从本仓库的 Release 获取文件。

首次打开按引导自行配置 API。Windows 使用 DPAPI、Android 使用 Keystore 在本机加密保存 Key。Windows 的普通覆盖更新和卸载保留 `%LOCALAPPDATA%\ConversationNotes` 数据目录；Android 更新不要先卸载旧版，卸载或清除数据会删除记录和配置。Windows 应用、原网页版和手机数据分别保存，不自动同步。

Windows 和 Android 1.1.0 安装包已在同一 Release 更新，版本号不变：保留 Windows 分析请求校验修复，并新增版本与更新页。直接覆盖安装，不需要更改聊天格式或重新填写 Key。请核对更新后的 SHA256，并从 Release 说明中的对应源码链接获取匹配源码；已有标签不重写。详情见 [版本记录](CHANGELOG.md)。

### 更新提醒

从顶部下载图标、侧栏“版本与更新”或设置进入。开启自动检查后，每次打开应用以及运行期间每 6 小时读取本仓库公开 GitHub 发布信息，发现本平台新包时显示提醒；可暂不提醒某个构建或关闭自动检查，手动检查仍可用。退出应用后不会后台运行，也没有系统推送。

提醒通过内部构建标识区分同为 1.1.0 的不同安装包，Windows 与 Android 分别比较。缺失元信息、网络失败或 GitHub 限流不会冒充“最新版”，不会阻止对话使用。检查不发送 Key、聊天或设备标识，不调用模型，不消耗模型额度；GitHub 会正常接收到网络 IP 和固定 User-Agent。

旧安装包没有此功能，必须先手动覆盖安装本次包；此后才能收到更新提醒。软件仅打开固定 Release 下载页，不自动下载、安装或同步数据。源码发布时的更新元信息流程见 [发布与更新协议](docs/UPDATES.md)。

## 免费软件与模型服务费用

**本软件免费使用，不提供任何充值、代充、收款或支付功能，也不出售或赠送 API Key。**

所有 API Key 均由模型供应商或其官方 API 平台提供，由用户自行注册、申请和管理。模型调用、额度购买和充值费用由用户自费承担，付款及售后由用户与供应商直接处理。

软件中的入口只跳转供应商官方网页，不携带 Key 或聊天内容，不代登录、绑卡、开通自动充值或购买积分。测试连接和示例分析也可能消耗额度。免费额度、价格、限额和账号验证要求可能变化，以供应商当前官方信息为准，不承诺免费或无限的模型服务。

## 为什么用 Jev

Jev 是 TypeSafe 推出的结构化判断模型，直接返回分类、评分和概率。这款工具主要需要逐句判断，不需要生成长篇回答，正好适合它的输出方式；情绪和意图也可以放在同一次请求里并行分析。

- [创始人 Diogo Almeida 的 Jev 首发推文（2026-09-15）](https://x.com/CompleteSkeptic/status/2099925682726002904)
- [官方模型介绍](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

## 申请 API Key

下面三个平台任选一个，都调用 Jev。不用同时注册，也不用把网站部署到 Vercel。

| 平台 | 创建 Key | 配置时选择 | 官方额度 / 充值入口 |
| --- | --- | --- | --- |
| TypeSafe 官方 | 登录 [API Keys 页面](https://console.typesafe.ai/keys)，创建并保存完整 Key | `typesafe` | [官方控制台](https://console.typesafe.ai/)；额度、计费及是否提供充值以当前控制台为准 |
| Vercel AI Gateway | 登录，进入 [AI Gateway → API Keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys)，点击 **Create key**。不要使用账户 Access Token | `vercel` | [AI Gateway](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway)，点击右上角 Credits 查看余额或自行购买 |
| OpenRouter | 登录 [API Keys 页面](https://openrouter.ai/settings/keys)，创建并保存 Key，按需设置用量上限 | `openrouter` | [Settings → Credits](https://openrouter.ai/settings/credits)，自行查看余额或购买积分 |

确认所选平台有可用额度及 Jev 访问权限；账号验证、付款方式、赠额和活动以各平台控制台为准。遇到 Vercel 的账号验证 403，请按其官网要求自行处理；本软件不会替你提交支付信息。

## 本地运行

界面采用参考中的纸感设计：暖白背景、细边框卡片、蓝色主按钮和少量便签色。桌面与手机使用相同的分析规则。

需要 Node.js 22.12+。下载源码并解压，在项目目录运行（macOS、Windows、Linux 相同）：

```sh
npm ci
npm run setup
```

按提示**选择平台 → 粘贴该平台的 Key**。Key 输入时不显示，配置保存在本机 `.env`；地址和模型名自动设置。随后会用一条测试消息检测连接，消耗少量 API 额度，不读取你的聊天。

```sh
npm run build
npm start
```

打开 **http://127.0.0.1:3178/**。使用时保持终端运行；下次只需执行 `npm start`。切换平台或更换 Key，重新运行 `npm run setup`，然后重启服务，无需重新构建。

### Android 手机应用

公开安装包见 [Releases](https://github.com/Alpasto-25/conversation-notes/releases)，应用名为“对话手记”。Android 8.0 以上可安装；此前开发构建的真机验证对象为 OPPO Android 16，当前关闭调试的公开构建尚未重新进行真机安装验证。手机直接请求模型服务，不依赖电脑服务、数据线或同一 Wi-Fi；分析需要手机能联网访问所选 API。

点击手机应用右上角“API 已配置 / 配置 API”或省略号，可选择平台、保存 Key、测试连接。Key 通过 Android Keystore 加密保存，不在 APK 或页面存储中。留空保存会保留同一平台的原 Key；切换平台必须提供该平台的 Key。电脑与手机的聊天记录、API 配置分别独立，不会自动同步。卸载、清除应用数据或更换手机会丢失手机记录及配置，系统云备份和设备迁移已关闭。

这是本地自用签名构建，尚未按应用商店发行标准交付。公开构建关闭 WebView 调试和 USB 配置迁入；应用商店发行仍需要正式签名管理和更多机型验证。不要分享签名文件、`.env` 或聊天记录。

本机重新打包或安装（使用已安装的 Android Studio JDK、SDK 36 和 build-tools 36.0.0，不需要 Gradle）：

```powershell
npm run build:android
npm run install:android
```

首次安装后，直接在手机设置填写 Key。公开构建不开放开发用的 USB 配置迁入入口。构建脚本自动审查 APK 的私有配置、已知密钥泄漏和官方链接白名单；也可以用 `node --import tsx scripts/audit-android.mjs <APK路径>` 单独审查。

### 重新构建 Windows 应用

在 Windows x64 上运行 `npm run build:desktop`。脚本构建前端、编译 .NET Framework / WebView2 窗口、运行原生离线检查并审查安装载荷，生成安装器和便携 ZIP。构建工具首次下载需要网络，终端用户不需要 Node.js。架构、加密与数据位置见 [desktop/README.md](desktop/README.md)。

标准 Git checkout 的构建工具和中间产物在仓库的 `work/`，安装包在 `outputs/`，均被 Git 忽略。为兼容早期本机部署，若项目本身位于外层 `outputs/` 目录下，仍使用原来的外层输出位置。

<details>
<summary>手动配置 / 旧版升级</summary>

也可以复制 `.env.example` 为 `.env`，只改这两行：

```dotenv
JEV_PROVIDER=vercel
JEV_API_KEY=你的平台Key
```

`JEV_PROVIDER` 只能填 `typesafe`、`vercel` 或 `openrouter`，Key 必须来自对应平台。不要填写 API 地址或模型名。原来的 `TYPESAFE_API_KEY=...` 配置仍然兼容，不切平台无需修改。

已有 `JEV_API_KEY` 时优先使用它；未填写时，按所选平台读取 `TYPESAFE_API_KEY`、`AI_GATEWAY_API_KEY` 或 `OPENROUTER_API_KEY`。不跨平台借用 Key。终端环境变量优先于 `.env`，排查配置时注意是否有旧的环境变量。

</details>

连接检测失败时，运行 `npm run check:api` 重试。401 检查 Key，402 检查额度，403 检查模型权限，429 等待限流恢复。网络错误需要检查本机到对应平台的连接。配置向导保存成功与连接检测通过会分开提示。

## 怎么用

1. 在顶部选择分析场景，粘贴对话记录或点击“导入文本文件”。
2. 选择哪个昵称是自己，确认场景，点击“开始分析”。更换场景后点击“继续分析”重新评价，单纯切换场景不会调用模型。
3. 查看情绪、意图和回复评级，点击标签展开详情。
4. 有新聊天时继续粘贴，结果会随上下文更新。

### 支持的聊天格式

| 来源 | 粘贴方式 |
| --- | --- |
| 微信 | 电脑版多选复制的“昵称 → 时间 → 正文”三行格式 |
| QQ | `昵称: 09-17 19:26:53`，下一行是正文；也支持带年份的日期 |
| WhatsApp | [导出聊天](https://faq.whatsapp.com/1180414079177245/)后，打开 `.txt` 并复制内容；支持下方两种常见格式 |
| iMessage / 其他软件 | 将文字整理成 `昵称: 内容`，一条消息一个开头；支持英文和带空格的昵称 |
| 邮件往来 / 访谈文字 | 按时间顺序整理为 `姓名: 内容`，保留原文与说话人；也可导入已整理的文本文件 |

```text
[9/17/26, 7:26:53 PM] Alex: Dinner tonight?
[9/17/26, 7:27:00 PM] Me: Sounds good
```

```text
17/09/2026, 19:26 - Alex: Dinner tonight?
17/09/2026, 19:27 - Me: Sounds good
```

iMessage 等软件复制后若只有正文，没有发送人，请先补上 `Alex:` / `Me:`，程序不会猜谁说了哪句话。这里只兼容整理后的文字，未验证 iMessage 原生批量复制格式，也不读取它的数据库。WhatsApp 不同语言、版本的导出格式可能不同；以上格式有自动化测试覆盖，不代表所有客户端都已实测。

保留多行正文和连续同人发言，日期按原样保存，不猜月份/日期顺序或缺失年份。只支持两人文字对话，不解析图片、语音、ZIP、HTML 或聊天数据库，也不后台监听。群聊需要先整理出两人的相关交流，附件和音视频需要先转为文字。其他软件采用通用文字格式，不代表已经接入其账号或验证全部原生导出格式。界面和分析标签目前为中文，英文 README 不代表界面已英文化。

## 说明

- 普通场景的沟通状态由回应投入、理解确认、尊重边界、支持配合、表达清晰、行动跟进六项加权得出。合理拒绝和表达边界不会触发恋爱拒绝的评分上限；下一步仍优先尊重明确的限制。
- 暧昧和恋爱场景的好感信号仍由主动延续、回应投入、关心体贴、自我开放、亲密表达、实际行动六项加权得出。明确且仍有效的恋爱拒绝会限制总分；分数不是对方喜欢你的概率。
- 不同场景的分数不宜直接比较。评分不能证明真实心理、亲密程度、合作成功率或成交机会。
- 浏览器数据库与原端口保持一致，旧对话原文会保留。升级后评分规则已更新，旧分析需要按选定场景重新计算。
- 长聊天自动分批，不再限制整个会话只能保存 500 条。追加时分析新增内容、复查最近的对方消息；自己的旧回复评级保留。
- 评分使用近期原文与相关历史原话。邀约、关心、拒绝、撤回等事件会被索引，但旧分数不会作为新评分的证据。历史检索可能遗漏相关线索，结果仍是辅助参考。
- 每个模型请求仍控制在 500 条、12,000 字以内；单条超长消息会保存并提示拆分。一次粘贴超过 25 万字符时请分次追加，历史总量受浏览器存储空间限制。
- 聊天和分析保存在当前浏览器的本机数据库，刷新后恢复；设置中的“清空聊天，重新开始”会删除这些记录。不同浏览器或不同网址端口不共享记录，清理浏览器数据也会删除记录。
- 分析所需原文会发送至你选择的平台及其模型服务商，模型用量由自己的账号承担；本机保存不等于离线分析。
- 网页能打开但无法分析时，先检查启动终端、Key 和账号额度。不要把 `.env` 或私人聊天提交到仓库。

## 开发

React + TypeScript + Vite + Express。三平台共用同一套情绪、意图和评分规则，仅切换请求入口：

| 平台 | 接口 | 模型 |
| --- | --- | --- |
| TypeSafe | [System One](https://docs.typesafe.ai/api) | `jev-1.13.0` |
| Vercel | [TypeSafe 兼容接口](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) | `typesafe-ai/jev` |
| OpenRouter | [Decisions（Alpha）](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request) | `typesafe/jev-1.13` |

保留 Jev 原始概率和确定度，不通过 Chat Completions 模拟评分。Vercel 的模型别名由平台维护，实际版本可能更新；不同入口不保证给出完全相同的结果。三平台有离线协议与分析流程测试覆盖。2026-09-22 已用真实 Vercel 账号验证三种判断、好感度总览、情绪与意图、回复评级；OpenRouter 尚未完成真实账号调用验证。自己的账号是否可用，请运行 `npm run check:api`。

```sh
npm run dev        # 开发模式：http://127.0.0.1:5178/
npm test           # 本地测试，不调用模型
npm run check:api  # 检查所选平台的 Key 和三种判断接口，使用少量 API 额度
npm run check:live # 用示例聊天检查完整分析，使用所选平台的 API 额度
```

## License

[MIT](LICENSE)，完整保留原项目的版权及许可文字。原作与本扩展的贡献归属见 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。本项目与原作者、微信、腾讯及 TypeSafe 无官方隶属或背书关系。
