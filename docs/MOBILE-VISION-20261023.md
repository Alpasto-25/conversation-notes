# 双端功能同步与多模态接口（2026-10-23 本地试用）

Windows 与 Android 共用聊天、模型选择、分析历史和用量代码。本次补齐 Android 截图入口、图片多选和原生识图通道，没有更换应用 ID、签名、密钥存储或手记结构。

## 功能对应

| 功能 | Windows / Android |
| --- | --- |
| Jev、DeepSeek、OpenAI 基础判断 | 均支持，选择明确影响后续分析 |
| 策略与潜台词 | 均支持；开启后 DeepSeek 写文字，Jev / OpenAI 组合保留各自判断 |
| 截图识别 | 均可独立选 OpenAI 或 DeepSeek；最多六张、排序、左右身份、编辑校对、只保存或分析 |
| 每次用量 | 均按基础、补充、截图分卡，显示时间、模型、耗时、费用；详细统计折叠 |
| 历史结果 | 均自动保存，可检索、恢复、以副本打开、删除；删除不抹掉实际用量 |
| 编辑、搜索、收藏、跟进、文件夹、回收站、阅读全屏 | 使用相同业务逻辑与手机响应式布局 |
| 备份、恢复、分享与报告 | 保留现有流程；新文字解读支持备份和脱敏导出 |
| 系统适配 | 手机使用系统图片多选和原生分享；桌面保留窗口侧栏调整、旧 .env 导入 |

## 使用

输入区的扫描图标打开截图导入。在弹窗内选择 OpenAI · OpenRouter 或 DeepSeek Flash；仅点击“识别截图”才上传，选择图片、切换模型或保存配置不会自动识图。截图不保存到手记或备份，识别出的聊天文字会保存。原文校对后可只保存，也可确认分析。

API 页关闭“表达方式与潜台词”时，仅做所选模型的基础分析。开启后组合可选 DeepSeek、Jev + DS、OpenAI + DS。文字解释遵循判断结果，不能新增策略类别、改变概率或在无潜台词时编写隐藏含义。新解读保存在原有详情中，不增加主聊天区高度。历史文字仍可查看；重新补充生成新版文字，原文未变化的已完成判断可复用。

OpenAI 仍使用用户原有 OpenRouter Key；判断为 `openai/gpt-6-luna-decisions`，识图为 `openai/gpt-6-luna`。DeepSeek 识图使用官方 `deepseek-flash`，与文字分析共享 DeepSeek Key。配置保存在本机加密存储，渲染页面不获得 Key。辅助识图配置保留当前判断模型。

## 接口与计费

- [DeepSeek Vision 官方文档](https://api-docs.deepseek.com/guides/vision)：用户消息的 `image_url` 图片块，固定 `https://api.deepseek.com/chat/completions`，`deepseek-flash`，JPEG base64 与 high detail。
- [OpenAI 图像输入文档](https://developers.openai.com/api/docs/guides/images-vision)：沿用现有图片消息格式，经 OpenRouter 固定通道调用。
- 每张图单独调用，不自动重试；取消、失败与返回不完整均保留已知用量。没有返回的费用显示未知，不按零元计费。
- OpenRouter 实际美元费用与 DeepSeek 人民币预估分别呈现。DeepSeek 的图片 tokens 纳入平台返回的输入 tokens，缓存字段沿用原有价格估算，不另造图片固定单价。
- 请求只允许选定平台；原生层校验 JPEG 内容及 1 MiB 上限，禁止外部图片 URL 和任意接口。Android 内容 URI 仅来自系统文件选择器。

## 验证边界

使用合成聊天、合成截图与离线原生桥验证，不读取用户 Key，不调用真实模型。Node 270 项、Windows 原生 203 项、Android 截图输入 18 项检查通过；Android 签名和包审查通过。浏览器验证使用实际 desktop/mobile 两种生产构建，并检查 320 / 390 / 800 / 820 / 1365 像素布局。

没有连接 Android 真机；系统相册授权、多选以及供应商 OCR 准确率、真实响应时间与扣费仍需在设备与账号上试用。此次为本地安装包交付，没有发布。
