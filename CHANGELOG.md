# 本 Fork 的版本记录

## 对话手记 1.1.0：Windows 修复更新（版本号不变）

继续首先感谢 [FerryCorleone](https://github.com/FerryCorleone) 和 [crush-monitor](https://github.com/FerryCorleone/crush-monitor) 的贡献者提供卓越的设计与工程基础。原作者历史、版权与 MIT 许可完整保留；本 Fork 的 Windows 打包错误由本 Fork 修复，不代表原作者发行或背书。

- 修复 Windows 原生层只接受字符串 `state`、误拒绝分析引擎实际发送的对象 `state` 的问题；普通聊天和默认示例不再因此报“分析请求格式不正确”。
- 原样保留嵌套对话上下文、场景和结构化 instructions，不改聊天解析、评分规则或数据库格式。
- 新增实际 WebView 消息结构的三供应商传输回归检查；无效状态仍在本机拒绝。
- 78 项 C# 离线检查、69 项 Node 离线测试通过；真实 WebView → 原生请求链路完成 53 项界面断言，覆盖默认示例、冒号文本、Markdown 文本和八种场景。仅替换 HTTP 响应，未绕过原生校验，未调用真实模型。
- 同一 Release 的 Windows 安装器和便携 ZIP 替换为修复包，版本号保留 1.1.0；同一安装位置直接覆盖，现有 DPAPI 配置与 IndexedDB 记录格式保持不变。SHA256 已更新，旧标签不重写，修复源码通过 Release 中的对应提交链接提供。
- Android APK 沿用 1.1.0，本次未更新或安装手机。

软件继续免费，不提供充值、收款或 Key 销售。Key 由用户自行向供应商获取，模型调用费用由用户自费承担；离线测试通过不代表真实供应商的当前可用性或分析准确性。

## 对话手记 1.1.0

本扩展基于 [FerryCorleone/crush-monitor](https://github.com/FerryCorleone/crush-monitor)。首先感谢原作者和贡献者卓越的创意、设计与工程工作；本版本的安装包不是原作者发行物。完整归属见 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)，原 MIT 许可证保持不变。

- 四步首次使用引导，可跳过，完成或跳过后不再自动弹出，设置中可以重看。
- TypeSafe、Vercel AI Gateway 和 OpenRouter 的 Key 获取教程、官方额度 / 计费或充值入口。
- 明确软件免费、不充值或收款，Key 由用户向供应商自行获取，模型服务费用由用户自费承担。
- Windows x64 安装器及便携 ZIP，Android 本机 APK。公开 Android 构建关闭调试及 USB 配置迁入。
- 69 项 Node 离线测试、48 项桌面原生检查；独立 profile 的引导与设置流程、361px 布局及 Windows 覆盖升级已验证。

模型结果仅供参考；需要联网调用用户选择的模型服务。三个客户端的数据不自动同步。Windows 安装包未商业代码签名，Android APK 使用本地自用签名，非应用商店发行；关闭调试的公开 APK 尚未重做手机实装验证。
