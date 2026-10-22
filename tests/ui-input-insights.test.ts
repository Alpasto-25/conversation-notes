import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { editableTarget, requestSoftKeyboard } from "../src/soft-keyboard";
import { NotebookInsights } from "../src/NotebookInsights";
import { newNotebook, emptyConversation } from "../src/notebooks";

function field(tag: string, attrs: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  const node: Record<string, unknown> = {
    tagName: tag,
    getAttribute: (name: string) => attrs[name] ?? null,
    disabled: false,
    readOnly: false,
    ...extra,
  };
  node.closest = () => node;
  return node;
}

test('只有真正需要键盘的输入框才会请求软键盘', () => {
  const input = field("INPUT");
  assert.equal(editableTarget(input), input);
  const text = field("TEXTAREA");
  assert.equal(editableTarget(text), text);
  const area = field("DIV", { contenteditable: "true" });
  assert.equal(editableTarget(area), area);
  assert.equal(editableTarget(field("DIV", { contenteditable: "false" })), undefined);
  for (const type of ["checkbox", "radio", "button", "file", "range"]) assert.equal(editableTarget(field("INPUT", { type })), undefined);
  assert.equal(editableTarget(field("INPUT", {}, { disabled: true })), undefined);
  assert.equal(editableTarget(field("TEXTAREA", {}, { readOnly: true })), undefined);
  assert.equal(editableTarget({ closest: () => null }), undefined);
  assert.equal(editableTarget(null), undefined);
  assert.equal(editableTarget({}), undefined);
});

test('聚焦时通知原生显示键盘，无桥接与重复聚焦不发送', () => {
  const calls: { method: string; payload: string }[] = [];
  const bridge = { call: (_id: string, method: string, payload: string) => { calls.push({ method, payload }); } };
  assert.equal(requestSoftKeyboard(undefined), false);
  assert.equal(requestSoftKeyboard(bridge, 1_000), true);
  assert.equal(requestSoftKeyboard(bridge, 1_100), false, '同一秒内的连续聚焦不应重复请求');
  assert.equal(requestSoftKeyboard(bridge, 2_000), true);
  assert.deepEqual(calls.map(call => call.method), ["showKeyboard", "showKeyboard"]);
  const broken = { call: () => { throw new Error("bridge gone"); } };
  assert.equal(requestSoftKeyboard(broken, 10_000), false);
});

test('我的手记与待跟进行内元素共用一套对齐结构', () => {
  const note = newNotebook(emptyConversation("general"), "测试手记", "对方");
  const conversation = { ...emptyConversation("general"), messages: [
    { id: "m1", sender: "other" as const, text: "周六一起看电影？", timestamp: null, kind: "text" as const },
  ], events: { m1: { id: "m1", kind: "invitation" as const, confidence: 0.8, status: "uncertain" as const } } };
  const html = renderToStaticMarkup(createElement(NotebookInsights, {
    note: { ...note, conversation, scenes: {}, favorites: ["m1"] },
    save: async () => undefined,
    locate: () => {},
  }));
  assert.match(html, /class="notebook-insights"/);
  assert.match(html, /class="insight-toggle"/);
  assert.match(html, /class="insight-favorites"/);
  assert.match(html, /class="insight-followups"/);
  assert.match(html, /class="followup-item"/);
  assert.match(html, /class="followup-head"/);
  assert.match(html, /模型状态：不确定/);
  assert.match(html, /class="text-button followup-locate"/);
  assert.match(html, /class="primary insight-save"/);
  assert.ok(html.includes("定位原话"));
});
