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

用量页仅精简展示，逐请求时间、实际返回模型、补全与校验诊断仍随分析保存在本机。DeepSeek 费用依据 `shared/billing.ts` 中标明日期的官方人民币价格估算，分别计算命中输入、未命中输入和输出。按请求时间判断峰谷，并使用已核对的 2026 节假日日历；跨时段或缓存信息缺失时显示范围。未知模型、旧价格期或无法拆分的历史用量不生成精确费用。未返回用量的失败请求无法估算，以供应商账单为准。Jev 汇总不能视作可核算的详细用量，也不能合并到 DeepSeek 费用。
