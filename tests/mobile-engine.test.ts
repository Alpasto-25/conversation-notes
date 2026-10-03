import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { analyzeWithEvaluator, requestSchema } from "../shared/analysis-core";
import { validateResult } from "../shared/provider-contract";
import {
  RELATIONS,
  RUBRIC,
  requestContextKey,
  type AnalysisRequest,
} from "../shared/types";

test("共享引擎在八种手机场景保留逐句、总览和相同 SHA256 校验", async () => {
  for (const relation of Object.keys(
    RELATIONS,
  ) as AnalysisRequest["relation"][]) {
    for (const task of [
      "overview",
      "other_messages",
      "self_message",
    ] as const) {
      const input: AnalysisRequest = {
        relation,
        task,
        revision: 3,
        targetIds:
          task === "overview" ? [] : [task === "other_messages" ? "m1" : "m2"],
        messages: [
          {
            id: "m1",
            sender: "other",
            kind: "text",
            text: "明天下午可以吗？",
            timestamp: null,
          },
          {
            id: "m2",
            sender: "self",
            kind: "text",
            text: "可以，下午三点见。",
            timestamp: null,
          },
        ],
      };
      assert.ok(requestSchema.safeParse(input).success);
      const signal = new AbortController().signal;
      const result = await analyzeWithEvaluator(
        input,
        async (payload, receivedSignal) => {
          assert.equal(receivedSignal, signal);
          const answers = Object.fromEntries(
            Object.entries(payload.questions).map(([id, q]) => {
              if (q.type === "noul") return [id, { type: "noul", noul: 0.1 }];
              const keys = Object.keys(q.criteria);
              const probabilities = Object.fromEntries(
                keys.map((key, index) => [key, index === 0 ? 1 : 0]),
              );
              return [
                id,
                {
                  type: q.type,
                  confidence: 1,
                  probabilities,
                  ...(q.type === "choice" ? { choice: keys[0] } : { score: 0 }),
                },
              ];
            }),
          );
          return validateResult(
            {
              model: "test-mobile",
              answers,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
            payload.questions,
          );
        },
        signal,
      );
      assert.equal(
        result.contextHash,
        createHash("sha256").update(requestContextKey(input)).digest("hex"),
      );
      assert.equal(result.rubricVersion, RUBRIC);
      assert.equal(result.revision, 3);
      if (task === "overview") assert.ok(result.overview);
      else assert.equal(result.lines?.[0].id, input.targetIds[0]);
    }
  }
});

test("共享评分和概率校验没有 Node 依赖，可打包进离线 Android 页面", async () => {
  for (const file of ["analysis-core.ts", "provider-contract.ts"]) {
    const source = await readFile(
      new URL(`../shared/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /from\s+["']node:|process\.env|\.\/provider["']/,
    );
  }
});
