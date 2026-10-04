# 对话手记

[English](README.en.md)

用于双人文字对话的本机分析工具，支持日常、朋友、家庭、工作、客户及恋爱场景，提供情绪、意图、表达质量和下一步建议。

> **首先感谢原作者 [FerryCorleone](https://github.com/FerryCorleone) 及贡献者的卓越贡献。** 原项目 [crush-monitor](https://github.com/FerryCorleone/crush-monitor) 的原创构想、对话解析和 Jev 分析实现是本扩展的基础。本项目是非官方 Fork，不代表原作者背书；原 MIT 许可完整保留，详见[致谢与贡献归属](ACKNOWLEDGEMENTS.md)。

## 下载与安装

从 [夸克网盘资源入口](https://pan.quark.cn/s/7894e2647abc?pwd=LQxA) 下载，提取码 `LQxA`；[最新 GitHub Release](https://github.com/Alpasto-25/conversation-notes/releases/latest) 提供备用下载和更新说明：

- Windows 安装版：`ConversationNotes-Setup-1.1.2-x64.exe`。
- Windows 便携版：解压 `ConversationNotes-Portable-1.1.2-x64.zip`，运行 `ConversationNotes.exe`。
- Android：`conversation-notes-1.1.2.apk`，支持 Android 8.0+。

Windows 需要 Windows 10 1809 / Windows 11 和 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)，无需 Node.js。安装包未商业代码签名，Android 使用本地自用签名；请核对 Release 中的 SHA256，勿关闭系统安全防护。更新直接覆盖安装，手机不要先卸载。

## 使用

在“外观模式”中选择跟随系统、浅色或暗色，选择会保留。默认开启启动更新检查，发现有效新版本时弹窗提醒；可稍后处理，也可关闭当前构建的提醒，更新入口红点仍保留。应用不自动下载或安装，更新检查不调用模型。

1. 首次打开按引导选择 API 平台，填写该平台的 Key；设置中提供获取教程和官方计费入口。
2. 选择分析场景，粘贴对话或导入文本文件，确认哪个昵称是自己。
3. 点击“开始分析”，查看结果；追加新聊天可继续分析。

“对话文件夹”按场景和聊天对象分类。新建保留旧记录，切换直接恢复原文及已保存分析，不再次消耗模型额度；导入也可先只保存、不分析。

文件夹可整理名称、对象与场景、排序并记住展开状态。整份手记删除后进入回收站，可恢复；单条消息删除需确认，会清除该手记依赖旧上下文的分析，不自动重算。电脑最大化时界面随窗口扩展。

1.1.2压缩了情绪 / 意图标签和“我的表达 / 下一步”功能条的留白，文字样式保持不变。点击功能条右上方的全屏按钮可展开聊天记录及已有分析，情绪、意图、回复评价和底部功能条保留，仍可点击查看完整解读；再次点击恢复正常布局，并回到进入全屏前的阅读位置。全屏不重载聊天、不丢失草稿、不自动调用模型，支持手机返回键和 Esc 退出。

支持微信、QQ 和常见 WhatsApp 文字格式；其他来源可整理为：

```text
我：明天下午一起讨论方案吗？
对方：可以，三点见。
```

仅支持双人文字对话，不读取聊天软件账号或数据库。图片、语音需先转为文字。

“版本与更新”确认有新版后显示红点，可手动检查并跳转下载页；自动检查在启动时及运行期间每 6 小时执行，可关闭。关闭提醒不会清除红点，不会自动下载安装，退出后不后台运行。

## API 与费用

支持 [TypeSafe](https://console.typesafe.ai/keys)、[Vercel AI Gateway](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys)、[OpenRouter](https://openrouter.ai/settings/keys) 和 [DeepSeek 官方 API](https://platform.deepseek.com/api_keys)，Key 必须来自对应平台。

1.1.2新增 DeepSeek Flash / Pro 和聊天页“模型”选择器。各平台的 Key 在电脑/手机各自加密保存一次，之后切换模型或切回已配置平台无需重复填写；旧版 Jev 配置继续可用。切换本身不调用模型，不清除已有分析；新模型用于后续主动分析。不同模型的速度、结果及费用不同，实际响应还受网络和供应商负载影响。

DeepSeek Flash / Pro 使用 JSON 模式，每题列出完整候选键，避免事件与意图选项混用。模型返回带候选键的相对权重，由应用统一归一化为概率与评分，避免长记录分析依赖模型手算概率合计或数数组位置。缺失问题、带非零权重的未知候选、全零或非法权重仍会拒绝。可定位到单题的问题只以 JSON 模式补全一次，保留同批已通过答案，实际用量累计计入；补全仍不合法则报错并保留已完成进度。零权重占位不影响评分，旧版返回格式继续兼容。手机空状态卡片取消内部滚动与聊天按钮预留空间；短屏滚动整页，导入后继续使用原有聊天滚动区。

原网页版可在 `.env` 设置 `JEV_PROVIDER=deepseek` 和 `DEEPSEEK_API_KEY`；`JEV_MODEL` 可选 `deepseek-flash` 或 `deepseek-v4-pro`。保留原有配置变量，接口地址固定，无需填写 Base URL。

**软件免费，不提供充值、代充、收款或 Key 销售。API Key 由用户自行向供应商获取，模型调用和额度费用由用户自费承担。** 分析、示例和连接测试可能消耗额度；赠额、价格和模型权限以供应商为准。

## 隐私与说明

记录保存在本机，但分析片段会发送给所选模型供应商。仅使用有权分享的内容，勿公开 Key 或私人聊天；AI 结果仅供参考。电脑、手机和网页版数据独立，不自动同步；卸载手机应用或清理数据会删除记录及配置。

<details>
<summary>从源码运行 / 开发</summary>

需要 Node.js 22.12+，在项目目录运行：

```sh
npm ci
npm run setup
npm run build
npm start
```

打开 http://127.0.0.1:3178/，保持终端运行；下次只需 `npm start`，按 Ctrl+C 停止。网页版配置保存在本机 `.env`，不要提交到仓库。

开发：`npm run dev`；离线测试：`npm test`；打包：`npm run build:desktop` / `npm run build:android`。

</details>

[版本记录](CHANGELOG.md) · [安全说明](SECURITY.md) · [Windows 构建](desktop/README.md) · [更新协议](docs/UPDATES.md) · [MIT 许可](LICENSE)
