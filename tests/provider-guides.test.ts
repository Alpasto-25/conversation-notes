import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDER_GUIDES,
  OFFICIAL_PROVIDER_URLS,
  BILLING_DISCLOSURE,
  ONBOARDING_KEY,
  guideProvider,
  isOfficialProviderUrl,
  shouldShowOnboarding,
  markOnboardingSeen,
} from "../shared/provider-guides";

test("引导在首次使用时显示，完成或跳过后不再自动显示", () => {
  const values = new Map<string, string>([["unrelated", "preserved"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  assert.equal(shouldShowOnboarding(storage), true);
  markOnboardingSeen(storage);
  assert.equal(values.get(ONBOARDING_KEY), "seen");
  assert.equal(shouldShowOnboarding(storage), false);
  markOnboardingSeen(storage);
  assert.equal(values.get("unrelated"), "preserved");
  assert.equal(values.size, 2);
});

test("引导存储不可用时仍可显示、关闭，不影响使用", () => {
  assert.equal(shouldShowOnboarding({ getItem: () => { throw new Error("restricted"); } }), true);
  assert.doesNotThrow(() => markOnboardingSeen({ setItem: () => { throw new Error("restricted"); } }));
  assert.equal(shouldShowOnboarding({ getItem: () => "unknown-version" }), true);
});

test("平台教程只接受已支持的平台，未知或继承属性安全回退", () => {
  for (const provider of ["typesafe", "vercel", "openrouter"] as const)
    assert.equal(guideProvider(provider), provider);
  for (const provider of [undefined, "", "other", "__proto__", "constructor", "toString"])
    assert.equal(guideProvider(provider), "typesafe");
});

test("三平台均提供用户自行申请 Key 的教程和官方入口", () => {
  assert.deepEqual(Object.keys(PROVIDER_GUIDES), ["typesafe", "vercel", "openrouter"]);
  for (const guide of Object.values(PROVIDER_GUIDES)) {
    assert.equal(guide.keySteps.length, 3);
    assert.match(guide.keySteps.join(" "), /登录/);
    assert.match(guide.keySteps.join(" "), /创建/);
    assert.match(guide.keySteps.join(" "), /回到本软件/);
    assert.ok(guide.billingSteps.length > 30);
    for (const value of [guide.keyUrl, guide.billingUrl, guide.docsUrl])
      assert.ok(isOfficialProviderUrl(value));
  }
});

test("官方白名单为九个唯一的 HTTPS 链接，没有私人数据或附加参数", () => {
  assert.equal(OFFICIAL_PROVIDER_URLS.length, 9);
  assert.equal(new Set(OFFICIAL_PROVIDER_URLS).size, 9);
  const hosts = ["console.typesafe.ai", "docs.typesafe.ai", "vercel.com", "openrouter.ai"];
  for (const value of OFFICIAL_PROVIDER_URLS) {
    const url = new URL(value);
    assert.equal(url.protocol, "https:");
    assert.ok(hosts.includes(url.hostname));
    assert.equal(url.username + url.password + url.hash + url.port, "");
    assert.ok(!/apiKey|token|chat|secret/i.test(url.search));
    assert.equal(isOfficialProviderUrl(value), true);
  }
  assert.equal(PROVIDER_GUIDES.typesafe.billingUrl, "https://console.typesafe.ai/");
  assert.equal(PROVIDER_GUIDES.openrouter.billingUrl, "https://openrouter.ai/settings/credits");
  assert.equal(new URL(PROVIDER_GUIDES.vercel.billingUrl).searchParams.get("to"), "/[team]/~/ai-gateway");
});

test("外部入口严格匹配，拒绝仿冒域名、修改查询、端口和协议", () => {
  for (const value of [
    "https://example.com",
    "http://console.typesafe.ai/keys",
    "javascript:alert(1)",
    "file:///C:/Windows",
    "https://console.typesafe.ai.evil.example/keys",
    "https://user@console.typesafe.ai/keys",
    "https://console.typesafe.ai:443/keys",
    " https://console.typesafe.ai/keys",
    ...OFFICIAL_PROVIDER_URLS.flatMap(url => [url + "#private", url + (url.includes("?") ? "&" : "?") + "apiKey=synthetic"]),
  ]) assert.equal(isOfficialProviderUrl(value), false);
});

test("费用声明明确免费、不充值、不售 Key、供应商供 Key 和用户自费", () => {
  assert.match(BILLING_DISCLOSURE.software, /本软件免费使用/);
  assert.match(BILLING_DISCLOSURE.software, /不提供任何充值、代充、收款或支付功能/);
  assert.match(BILLING_DISCLOSURE.software, /不出售或赠送 API Key/);
  assert.match(BILLING_DISCLOSURE.responsibility, /模型供应商或其官方 API 平台提供/);
  assert.match(BILLING_DISCLOSURE.responsibility, /用户自行注册、申请并管理/);
  assert.match(BILLING_DISCLOSURE.responsibility, /由用户自费承担/);
  assert.match(BILLING_DISCLOSURE.external, /只跳转供应商官方网页/);
  assert.match(BILLING_DISCLOSURE.external, /以供应商官方信息为准/);
});
