# 对话手记

[English](README.en.md)

用于双人文字对话的本机分析工具，支持日常、朋友、家庭、工作、客户及恋爱场景，提供情绪、意图、表达质量和下一步建议。

> **首先感谢原作者 [FerryCorleone](https://github.com/FerryCorleone) 及贡献者的卓越贡献。** 原项目 [crush-monitor](https://github.com/FerryCorleone/crush-monitor) 的原创构想、对话解析和 Jev 分析实现是本扩展的基础。本项目是非官方 Fork，不代表原作者背书；原 MIT 许可完整保留，详见[致谢与贡献归属](ACKNOWLEDGEMENTS.md)。

## 下载与安装

从 [最新 Release](https://github.com/Alpasto-25/conversation-notes/releases/latest) 下载：

- Windows 安装版：`ConversationNotes-Setup-1.1.0-x64.exe`。
- Windows 便携版：解压 `ConversationNotes-Portable-1.1.0-x64.zip`，运行 `ConversationNotes.exe`。
- Android：`conversation-notes-1.1.0.apk`，支持 Android 8.0+。

Windows 需要 Windows 10 1809 / Windows 11 和 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)，无需 Node.js。安装包未商业代码签名，Android 使用本地自用签名；请核对 Release 中的 SHA256，勿关闭系统安全防护。更新直接覆盖安装，手机不要先卸载。

## 使用

1. 首次打开按引导选择 API 平台，填写该平台的 Key；设置中提供获取教程和官方计费入口。
2. 选择分析场景，粘贴对话或导入文本文件，确认哪个昵称是自己。
3. 点击“开始分析”，查看结果；追加新聊天可继续分析。

支持微信、QQ 和常见 WhatsApp 文字格式；其他来源可整理为：

```text
我：明天下午一起讨论方案吗？
对方：可以，三点见。
```

仅支持双人文字对话，不读取聊天软件账号或数据库。图片、语音需先转为文字。

“版本与更新”可手动检查并跳转下载页；自动检查在启动时及运行期间每 6 小时执行，可关闭。不会自动下载安装，退出后不后台运行。

## API 与费用

支持 [TypeSafe](https://console.typesafe.ai/keys)、[Vercel AI Gateway](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys) 和 [OpenRouter](https://openrouter.ai/settings/keys)，任选一个，Key 必须来自对应平台。

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
