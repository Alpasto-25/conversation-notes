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
          <p>选择沟通场景，梳理情绪、表达和下一步建议。</p>
          <BillingNotice />
        </>}
        {step === 1 && <>
          <KeyRound className="guide-icon" size={30} />
          <h3>使用你自己申请的 API Key</h3>
          <ol className="guide-instructions">
            <li>在设置中选择 Jev 平台或 DeepSeek Flash。</li>
            <li>在对应平台官网创建 Key，并按需购买额度。</li>
            <li>粘贴 Key 并保存；应用会在本机加密保存。</li>
            <li>测试连接会消耗额度。不同平台的 Key 不可混用。</li>
          </ol>
          <p>电脑端也可导入旧版 .env 配置。</p>
          <button className="secondary" onClick={configure}>配置 API</button>
        </>}
        {step === 2 && <>
          <Upload className="guide-icon" size={30} />
          <h3>导入一段双方同意分享的对话</h3>
          <ol className="guide-instructions">
            <li>选好场景，粘贴“我：内容 / 对方：内容”，或导入 UTF-8 文本。</li>
            <li>确认哪个昵称代表你，再开始分析。</li>
            <li>手记可分类、移动和多选管理；重新打开会恢复已有分析。</li>
            <li>示例分析也会消耗 API 额度。</li>
          </ol>
          <p>记录保存在本机，分析片段会发送给所选模型。请先去掉敏感内容。</p>
        </>}
        {step === 3 && <>
          <Sparkles className="guide-icon" size={30} />
          <h3>结合原话和上下文阅读结果</h3>
          <ol className="guide-instructions">
            <li>查看总览，点开逐句情绪、意图和回复评价。</li>
            <li>模型解读仅供参考，不代表对方真实想法。</li>
            <li>电脑和手机分别保存，目前不自动同步。</li>
          </ol>
          <p>整份手记可从回收站恢复。删除单条消息会清除该手记的旧分析；分享可选择任意片段。</p>
        </>}
      </div>
      <div className="guide-actions">
        <button className="secondary" onClick={finish}>暂时跳过</button>
        {step > 0 && <button className="secondary" onClick={() => setStep(step - 1)}>上一步</button>}
        <button className="primary" onClick={() => step === names.length - 1 ? finish() : setStep(step + 1)}>{step === names.length - 1 ? "开始使用" : "下一步"}</button>
      </div>
      <p className="guide-footnote">可随时在设置中重看教程。</p>
    </section>
  );
}
