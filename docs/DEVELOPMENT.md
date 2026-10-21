# 开发说明

使用 Node.js 22.12+，在项目目录运行：

```powershell
npm ci
npm run dev
```

验证与构建：`npm test`、`npm run build`、`npm run test:desktop`、`npm run build:desktop`、`npm run build:android`。本机开发与公开发布分别授权，生成安装包不会自动上传。

- [界面规范](../UI_STYLE.md)
- [Windows 构建](../desktop/README.md)
- [表达方式与潜台词](SEMANTIC_ANALYSIS.md)
- [更新与发布](UPDATES.md)
- [API 与账务说明](../SECURITY.md)
- [2026-10-21 改进实施与验收](IMPROVEMENTS-20261021.md)
- [2026-10-21 Android 真机验收](DEVICE-TEST-20261021.md)

本地预览包请使用单独输出路径，保留正式旧包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/build.ps1 -OutputDirectory '..\improvements-20261021'
powershell -NoProfile -ExecutionPolicy Bypass -File android/build.ps1 -OutputPath '..\improvements-20261021\conversation-notes-1.1.4-dev-20261021.apk'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-android-files.ps1
```

1.1.5 发布时，用户明确要求不再测试。Windows 仅打包可使用 `desktop/build.ps1 -SkipTests -OutputDirectory <发布目录>`，此选项跳过测试与 QA 程序构建；默认构建流程仍执行既有原生测试。Android 使用 `android/build.ps1 -OutputPath <发布目录>/conversation-notes-1.1.5.apk`。安装包生成后由用户授权的发布流程上传，保留原签名和旧发布。

IndexedDB v3 增加 `notebookIndex`，从 v1/v2 在升级事务内生成摘要。列表读取摘要和一份当前正文，所有正文变更同时更新摘要。旧应用无法以 v2 连接已升级库；回退应使用改动前数据目录或经验证的备份副本，不删除新库强行降级。

草稿 350ms、分析 750ms 合并保存，切换手记和页面隐藏时尽力刷新。系统强制杀进程无法保证最后一瞬间落盘；Android 前台服务、后台通知及自动继续尚未实现。重开后由用户主动继续，并按有效上下文复用已完成结果。

用量页仅精简展示，逐请求时间、实际返回模型、补全与校验诊断仍随分析保存在本机。DeepSeek 费用依据 `shared/billing.ts` 中标明日期的官方人民币价格估算，分别计算命中输入、未命中输入和输出。按请求时间判断峰谷，并使用已核对的 2026 节假日日历；跨时段或缓存信息缺失时显示范围。未知模型、旧价格期或无法拆分的历史用量不生成精确费用。未返回用量的失败请求无法估算，以供应商账单为准。Jev 汇总不能视作可核算的详细用量，也不能合并到 DeepSeek 费用。
