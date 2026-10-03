import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, buildRequest, requestSchema } from "../server/analysis";
import { dimensionsForRelation } from "../shared/affinity";
import { actionResult } from "../shared/rules";
import { parseChat, toMessages } from "../shared/parser";
import { exampleForRelation } from "../shared/fixtures";
import {
  RELATIONS,
  isRomantic,
  type AnalysisRequest,
  type Relation,
} from "../shared/types";

const request = (relation: Relation): AnalysisRequest => ({
  relation,
  revision: 1,
  task: "overview",
  targetIds: [],
  messages: toMessages(
    parseChat("我：可以周四核对一下吗？\n对方：可以，但请不要在下班后联系我。")
      .messages,
    "我",
  ),
});

test("各场景贯通请求校验和示例导入，保留旧恋爱场景", () => {
  for (const relation of Object.keys(RELATIONS) as Relation[]) {
    assert.ok(requestSchema.safeParse(request(relation)).success, relation);
    const parsed = parseChat(exampleForRelation(relation));
    assert.equal(parsed.warnings.length, 0, relation);
    assert.equal(
      new Set(parsed.messages.map((m) => m.speaker)).size,
      2,
      relation,
    );
    assert.equal(
      dimensionsForRelation(relation).reduce((sum, d) => sum + d.weight, 0),
      100,
    );
  }
});

test("非恋爱场景使用沟通维度，并移除浪漫里程碑、调情建议和浪漫意图", () => {
  for (const relation of Object.keys(RELATIONS) as Relation[]) {
    const input = request(relation);
    const overview = buildRequest(input);
    const action = overview.questions.action as {
      criteria: Record<string, unknown>;
    };
    const line = buildRequest({
      ...input,
      task: "other_messages",
      targetIds: [input.messages[1].id],
    });
    const intents = line.questions[`${input.messages[1].id}_intents`] as {
      criteria: Record<string, unknown>;
    };
    assert.equal("flirt" in action.criteria, isRomantic(relation));
    assert.equal("interest" in intents.criteria, isRomantic(relation));
    assert.equal("flirt" in intents.criteria, isRomantic(relation));
    assert.ok("coordinate" in intents.criteria);
    if (!isRomantic(relation)) {
      assert.ok(overview.questions.affinity_respect);
      assert.ok(overview.questions.affinity_clarity);
      assert.equal(overview.questions.affinity_intimacy, undefined);
      const stage = overview.questions.stage as {
        criteria: Record<string, unknown>;
      };
      assert.equal(stage.criteria.flirt, undefined);
      assert.equal(stage.criteria.date, undefined);
      assert.ok(stage.criteria.agreement);
    }
  }
});

test("非恋爱场景拒绝不适用的调情首选和备选建议", () => {
  const answer = {
    type: "choice",
    choice: "flirt",
    confidence: 0.9,
    probabilities: { flirt: 0.55, continue: 0.45 },
  };
  const boundary = { type: "noul", noul: 0 };
  assert.equal(
    actionResult(answer, boundary, boundary, ["continue", "insufficient"])
      .action,
    "insufficient",
  );
  const result = actionResult(
    {
      ...answer,
      choice: "continue",
      probabilities: { continue: 0.55, flirt: 0.45 },
    },
    boundary,
    boundary,
    ["continue", "insufficient"],
  );
  assert.equal(result.action, "continue");
  assert.equal(result.alternative, undefined);
});

test("合理边界触发尊重建议，但不会给非恋爱沟通评分设置恋爱拒绝上限", async (t) => {
  const previous = {
    provider: process.env.JEV_PROVIDER,
    key: process.env.JEV_API_KEY,
  };
  t.after(() => {
    for (const [name, value] of [
      ["JEV_PROVIDER", previous.provider],
      ["JEV_API_KEY", previous.key],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.JEV_PROVIDER = "typesafe";
  process.env.JEV_API_KEY = "offline-test-key";
  t.mock.method(
    globalThis,
    "fetch",
    async (
      _url: Parameters<typeof fetch>[0],
      options?: Parameters<typeof fetch>[1],
    ) => {
      const payload = JSON.parse(String(options?.body));
      const answers = Object.fromEntries(
        Object.entries(payload.questions).map(([id, value]) => {
          const q = value as {
            type: string;
            criteria: Record<string, unknown>;
          };
          if (q.type === "noul")
            return [id, { type: "noul", noul: id === "boundary" ? 1 : 0 }];
          const keys = Object.keys(q.criteria);
          const selected =
            q.type === "score"
              ? "4"
              : id === "stage" && keys.includes("agreement")
                ? "agreement"
                : keys.includes("sufficient")
                  ? "sufficient"
                  : keys.includes("continue")
                    ? "continue"
                    : keys[0];
          return [
            id,
            {
              type: q.type,
              confidence: 1,
              probabilities: Object.fromEntries(
                keys.map((key) => [key, key === selected ? 1 : 0]),
              ),
              ...(q.type === "score" ? { score: 4 } : { choice: selected }),
            },
          ];
        }),
      );
      return Response.json({
        model: payload.model,
        answers,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  );
  const work = (await analyze(request("colleague"))).overview!;
  assert.equal(work.affinity.value, 100);
  assert.equal(work.boundaryApplied, false);
  assert.equal(work.action, "respect");
  assert.equal(work.stage, "agreement");
  assert.equal(work.rapport?.value, 100);
  assert.deepEqual(
    work.affinityDimensions?.map((d) => d.key),
    [
      "engagement",
      "understanding",
      "respect",
      "support",
      "clarity",
      "followthrough",
    ],
  );
  const romance = (await analyze(request("crush"))).overview!;
  assert.equal(romance.affinity.value, 25);
  assert.equal(romance.boundaryApplied, true);
  assert.equal(romance.action, "respect");
});
