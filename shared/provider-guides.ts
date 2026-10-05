export const PROVIDER_GUIDES = {
  deepseek: {
    name: 'DeepSeek', keyUrl: 'https://platform.deepseek.com/api_keys',
    billingUrl: 'https://platform.deepseek.com/usage', docsUrl: 'https://api-docs.deepseek.com/zh-cn/',
    keySteps: [
      '登录 DeepSeek 官方开放平台；聊天应用账号或订阅不等于 API 额度。',
      '进入 API keys 页面创建并妥善保存 Key，不要发送到聊天、截图或公开仓库。',
      '回到本软件，选择 DeepSeek Flash，粘贴 Key 并保存。',
    ],
    billingSteps: '在官方开放平台查看用量、余额与充值入口。模型费率以官网当前信息为准。',
    billingLabel: '用量与余额',
  },
  typesafe: {
    name: "TypeSafe",
    keyUrl: "https://console.typesafe.ai/keys",
    billingUrl: "https://console.typesafe.ai/",
    docsUrl: "https://docs.typesafe.ai/introduction/quickstart",
    keySteps: [
      "打开官方 API Keys 页面，注册或登录你自己的 TypeSafe 账号。",
      "在 Keys 页面创建 API Key，妥善保存完整 Key，不要发到聊天、截图或公开仓库中。",
      "回到本软件，选择 TypeSafe，只粘贴 Key 本身，然后保存配置。",
    ],
    billingSteps: "进入官方控制台查看账号额度、用量与计费信息；是否提供充值及其入口，以控制台当前显示为准。本软件不承诺永久免费或无限额度。",
    billingLabel: "额度与计费",
  },
  vercel: {
    name: "Vercel AI Gateway",
    keyUrl: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys",
    billingUrl: "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway",
    docsUrl: "https://vercel.com/docs/ai-gateway/authentication-and-byok/api-keys",
    keySteps: [
      "登录 Vercel 官方账号，选择要使用的个人空间或团队。",
      "打开 AI Gateway → API Keys，点击 Create key；创建后立即保存 Key，之后可能无法再次查看。",
      "回到本软件，选择 Vercel AI Gateway，粘贴该平台的 Key 并保存；不要使用普通 Vercel 访问令牌替代它。",
    ],
    billingSteps: "进入官方 AI Gateway 页面，点击右上角的 Credits 余额查看额度或购买积分。账号验证、可用模型、付款方式和费用以 Vercel 官方为准；请自行确认，不要误开自动充值。",
    billingLabel: "余额与充值",
  },
  openrouter: {
    name: "OpenRouter",
    keyUrl: "https://openrouter.ai/settings/keys",
    billingUrl: "https://openrouter.ai/settings/credits",
    docsUrl: "https://openrouter.ai/docs/faq",
    keySteps: [
      "注册或登录你自己的 OpenRouter 官方账号。",
      "进入 Settings → API Keys，创建 Key，按需设置使用额度上限，并妥善保存完整 Key。",
      "回到本软件，选择 OpenRouter，只粘贴 Key 本身并保存；其他平台的 Key 不能混用。",
    ],
    billingSteps: "进入官方 Settings → Credits 页面查看余额或自行购买积分。付款手续费、模型价格及支持的付款方式以官方页面为准，不要向软件作者或第三方代充转账。",
    billingLabel: "余额与充值",
  },
} as const;

export type GuideProvider = keyof typeof PROVIDER_GUIDES;
export function guideProvider(value?: string): GuideProvider {
  return value && Object.hasOwn(PROVIDER_GUIDES, value) ? value as GuideProvider : "typesafe";
}
export const OFFICIAL_PROVIDER_URLS: readonly string[] = Array.from(new Set(
  Object.values(PROVIDER_GUIDES).flatMap(({ keyUrl, billingUrl, docsUrl }) => [keyUrl, billingUrl, docsUrl]),
));
export function isOfficialProviderUrl(url: string) {
  return OFFICIAL_PROVIDER_URLS.includes(url);
}

export const BILLING_DISCLOSURE = {
  title: "软件免费，模型服务费用自理",
  software: "本软件免费使用，不提供任何充值、代充、收款或支付功能，也不出售或赠送 API Key。",
  responsibility: "所有 API Key 均由模型供应商或其官方 API 平台提供，需要用户自行注册、申请并管理；模型调用、额度购买和充值费用由用户自费承担，与本软件无关。",
  external: "只跳转供应商官方网页，额度和费用以供应商官方信息为准。",
} as const;

export const ONBOARDING_KEY = "conversation-notes-onboarding-v1";
type GuideStorage = Pick<Storage, "getItem" | "setItem">;
export function shouldShowOnboarding(storage: Pick<GuideStorage, "getItem">) {
  try { return storage.getItem(ONBOARDING_KEY) !== "seen"; }
  catch { return true; }
}
export function markOnboardingSeen(storage: Pick<GuideStorage, "setItem">) {
  try { storage.setItem(ONBOARDING_KEY, "seen"); }
  catch { /* Storage restrictions must never prevent using or closing the guide. */ }
}
