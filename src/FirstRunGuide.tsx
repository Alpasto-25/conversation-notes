import { useState } from "react";
import { NotebookPen, KeyRound, Upload, Sparkles } from "lucide-react";
import { BillingNotice } from "./ProviderHelp";

export function FirstRunGuide({ finish, configure }: { finish: () => void; configure: () => void }) {
  const [step, setStep] = useState(0);
  const names = ["了解手记", "配置 API", "导入对话", "阅读分析"];
  return (
    <section className="first-run-guide" aria-label="初次使用教程">
      <ol className="guide-progress" aria-label="教程步骤">
        {names.map((name, index) => <li key={name} aria-current={step === index ? "step" : undefined}>
          <button onClick={() => setStep(index)}><span>{index + 1}</span>{name}</button>
        </li>)}
      </ol>
      <div className="guide-content" aria-live="polite">
        {step === 0 && <>
          <NotebookPen className="guide-icon" size={30} />
          <h3>把对话读清楚，不替对方下结论。</h3>
          <p>对话手记可以分析日常、朋友、家庭、工作、客户或恋爱沟通。你选择场景，手记梳理情绪、表达和下一步建议。</p>
          <BillingNotice />
        </>}
        {step === 1 && <>
          <KeyRound className="guide-icon" size={30} />
          <h3>使用你自己申请的 API Key</h3>
          <ol className="guide-instructions">
            <li>在“分析设置”里选择 TypeSafe、Vercel AI Gateway 或 OpenRouter。</li>
            <li>展开对应平台的获取教程，点击官方入口，在供应商网站注册并创建 Key；需要额度时自行按官方规则付费。</li>
            <li>回到本软件，只粘贴 Key 本身并保存。电脑或手机应用会在本机加密保存，不把 Key 写进安装包。</li>
            <li>按需测试连接。测试也可能消耗供应商额度；切换平台必须使用该平台的 Key。</li>
          </ol>
          <p>原网页版的 Key 仍在电脑的 .env 中配置。电脑安装版也支持在设置中导入原 .env，不修改原文件。</p>
          <button className="secondary" onClick={configure}>现在去配置 API</button>
        </>}
        {step === 2 && <>
          <Upload className="guide-icon" size={30} />
          <h3>导入一段双方同意分享的对话</h3>
          <ol className="guide-instructions">
            <li>先选择合适的分析场景，再粘贴“我：内容 / 对方：内容”，或导入 UTF-8 的 .txt、.md、.log 文件。</li>
            <li>支持微信、QQ、WhatsApp 及其他双人文字对话；确认哪个昵称代表你，再点击“开始分析”。</li>
            <li>也可以先用示例了解操作。示例真正开始分析时同样会调用 API，并可能产生模型费用。</li>
          </ol>
          <p>不会自动读取任何聊天软件。记录在本机保存；分析所需的文字片段会发送给你选择的模型服务。请先去掉不希望分享的隐私内容。</p>
        </>}
        {step === 3 && <>
          <Sparkles className="guide-icon" size={30} />
          <h3>结合原话和上下文阅读结果</h3>
          <ol className="guide-instructions">
            <li>查看沟通状态及六个维度，再点开逐句情绪、意图和你的回复评价。</li>
            <li>评分和建议只作参考，不代表对方真实内心，也不替你作重要决定。</li>
            <li>重新打开可以继续本机记录；电脑应用、原浏览器和手机的记录分别保存，目前不会自动同步。</li>
          </ol>
          <p>需要重看时，打开“分析设置 → 重新查看使用引导”。清空聊天会删除当前记录，请谨慎确认。</p>
        </>}
      </div>
      <div className="guide-actions">
        <button className="secondary" onClick={finish}>暂时跳过</button>
        {step > 0 && <button className="secondary" onClick={() => setStep(step - 1)}>上一步</button>}
        <button className="primary" onClick={() => step === names.length - 1 ? finish() : setStep(step + 1)}>{step === names.length - 1 ? "开始使用" : "下一步"}</button>
      </div>
      <p className="guide-footnote">教程不会自动发起模型调用或充值；跳过后可随时从设置重看。</p>
    </section>
  );
}
