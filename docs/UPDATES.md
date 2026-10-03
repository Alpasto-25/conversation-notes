# Release 与更新提醒

本功能由非官方 Fork 增加；首先感谢 FerryCorleone/crush-monitor 提供的卓越设计与工程基础。原作者不为本功能或安装包背书，原 MIT 许可保留。

## 客户端行为

Windows 和 Android 的“版本与更新”页可手动检查或打开固定地址 `https://github.com/Alpasto-25/conversation-notes/releases/latest`。默认自动检查每次启动和运行期间每六小时执行；回到前台时如已超过间隔也检查。关闭应用后不运行后台服务，不推送，不自动下载或安装。偏好及每个构建的提醒关闭标记使用独立 localStorage 项，不修改 Key 或 IndexedDB。

只请求 `https://api.github.com/repos/Alpasto-25/conversation-notes/releases/latest`。Native GET 无 Authorization、请求正文或 Cookie，独立于模型配置和额度预算，禁止重定向，响应上限 128 KiB，成功及失败短缓存约六十秒。Windows/Node 使用十秒总截止；Android 连接和读取超时各十秒。客户端不发送 Key、聊天或设备标识；GitHub 会收到正常网络 IP 和固定 User-Agent。错误仅显示安全提示，不回显上游正文。

页面继续禁止跨网请求；不扩大九个供应商入口白名单。`openRelease` 是独立原生桥方法，无任意 URL 参数。网页版通过本机 `/api/updates` 转发固定请求；网页版需从最新源码重新部署，而不是安装原生包。

## 同版本构建识别

Vite 为每次构建生成平台、可见版本、唯一 `buildId` 和 UTC `builtAt`，同时嵌入脚本及 `www/build-info.json`。Windows 与 Android 分开比较。Release 说明末尾保留一个 `conversation-notes-update:` HTML 注释，其中为每个平台记录相应包的构建信息、安装附件名及 SHA256。

客户端验证固定仓库、稳定 Release、标签、附件已上传、附件下载 URL 和 GitHub 返回的 digest 与元信息一致后才比较。版本号增加时提醒；同版本仅在构建 ID 不同且构建时间更新时提醒。旧发布没有元信息时，仅确实增加的版本可用传统判断；同版本不猜测。缺元信息、附件不匹配或网络失败不声称“最新版”。该校验不是代码签名或第三方安全认证。

旧客户端没有检查代码，须先手动覆盖安装本次包；此后才支持未来提醒。下载不要求卸载旧应用。手机须用户手动安装。

## 发布流程

1. 完成源码测试、原生离线检查、隔离界面验收和安装包隐私审查，保持原作者署名与许可证；签名材料不上传。
2. 构建 Windows 与 Android 包。准备人工审核的发布说明，包括匹配源码链接、免费软件与供应商收费声明及测试边界。
3. 运行下列命令（路径相对于标准 checkout）：

   ```powershell
   node --import tsx scripts/prepare-release.ts outputs outputs/Release-notes-1.1.0.md
   ```

   早期外层 `outputs/crush-monitor` 布局使用上一级 `outputs`。脚本从便携 ZIP/APK 内读取真实构建信息，并生成说明末尾的机器注释与 `SHA256SUMS-1.1.0.txt`，本身不上传任何数据。

4. 先上传新附件并验证 GitHub digest/大小，更新安装包和校验表后，最后发布带正确构建元信息的完整说明。更新某个平台时保留另一个平台原包对应的元信息，不能借用其构建标识。不要删除机器注释，否则同版本检查会安全退回“无法核验”。
5. 再次通过无认证的公开 API 核对来源、标签、元信息及所有附件。使用 shared/updates 的 `inspectRelease` 验证每个平台当前包与发布信息一致，不应提示更新自身。

本次按用户要求保留 `v1.1.0`，不移动旧标签。GitHub 自动 Source code ZIP 因而仍为原标签的源码，发布说明必须提供最新匹配提交及其源码 ZIP 链接。之后的发布流程需由维护者按实际包版本更新构建、安装器及脚本的版本常量；不能仅修改说明中的数字。
