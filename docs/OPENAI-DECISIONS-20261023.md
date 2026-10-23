# OpenAI Decisions 与截图导入（本地试用）

手机同步与 DeepSeek 识图已补齐，参见 [双端多模态说明](MOBILE-VISION-20261023.md)。

本次在既有 OpenRouter 通道加入 `openai/gpt-6-luna-decisions`，分析问题、概率与评分继续走 `/api/alpha/decisions`，保留原 Jev 和 DeepSeek 配置。原生配置只接受固定模型，不开放任意地址。OpenRouter Key 继续使用本机 DPAPI 加密，不写入页面、备份或安装包。

## 使用

API 配置选择 OpenRouter，再选择 OpenAI Decisions 并保存自己的 Key。基础分析可关闭“表达方式与潜台词”；需要解释时选择决策模型 + DeepSeek，另配 DeepSeek Key。

电脑版输入区的三个图标依次为导入文本、识别聊天截图、格式帮助。可选择截图，或直接向输入区粘贴图片；不会增设常驻面板或挤占聊天阅读区。截图弹窗支持 PNG/JPEG/WebP、最多六张、顺序调整和左右身份选择。只有点击识别才上传；识别结果可编辑，再进入原有身份与范围校对，选择只保存或开始分析。

Decisions 输出有限选项、概率和评分，不能转录自由文本。截图转录使用同一 OpenRouter Key，单独请求视觉生成模型 `openai/gpt-6-luna` 与固定 `/api/v1/chat/completions`。模型需具有对应访问权限。此功能不是读取其他软件或系统截屏；用户自行选择或粘贴截图。

截图在内存中处理为 JPEG，每张不超过 1 MiB；最大处理宽度 1440 像素，过长截图提示分段。保留可辨认原文，模糊位置和非文字消息显示占位，仍需人工校对。原图不写入手记或备份。中止或失败保留已完成的转录及已返回用量，不自动重试视觉请求。

## 用量

保留 OpenRouter 返回的输入/输出 tokens、可用缓存统计及 `usage.cost` 美元费用，不自行换算成人民币，不把未返回值当作零。截图识别单独记入发起手记的历史账本；即使识别未完成或用户取消导入，也保留已发生用量。历史可按“对话分析 / 截图识别”筛选，支持备份往返。充值手续费、税费与未返回部分以平台账单为准。

## 验证边界

- TypeScript 检查、Node 离线逻辑与 Windows C# 离线传输检查。
- 浏览器使用隔离的离线原生桥夹具，检查配置、新模型分析、合成截图导入、实际返回字段展示、持久化、浅深色和 1365/820/390 像素布局。夹具画面及用量不是供应商实测。
- 不读取用户密钥，不使用用户真实聊天进行联网测试；真实权限、OCR 准确率、延迟与扣费由用户试用确认。
- Android 的共享模型白名单同步兼容新 Decisions 模型；截图入口仅在电脑版与 Web 中出现，本次不构建或安装 Android，不发布。

本地验收结果：Node 255/255；Windows C# 原生检查 196 项；浏览器离线桥流程与布局断言 34 项。最终桌面构建 `20261023044612570-f946931c`，安装前备份原程序与完整用户目录，390 个用户文件在安装后、首次启动前逐一核对 SHA-256 保持一致；启动后加密配置文件保持一致。电脑版使用既有用户目录打开，未执行真实模型调用。

## 文档依据

- [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions)
- [OpenRouter GPT-6 Luna Decisions](https://openrouter.ai/openai/gpt-6-luna-decisions)
- [OpenRouter Decisions 协议与 usage.cost](https://openrouter.ai/docs/guides/community/multimodal-decisions)
- [OpenRouter GPT-6 Luna](https://openrouter.ai/openai/gpt-6-luna)
