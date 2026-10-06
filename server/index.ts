import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { analyze, requestSchema } from "./analysis";
import { providerStatus, semanticProviderStatus, configuredProfiles, getConfiguredProviderConfig, ConfigurationError } from "./provider-config";
import { ProviderError, providerErrorMessage, evaluateSemanticPayload, evaluate } from "./provider";
import { analyzeSemantics, semanticFailureDetails, semanticGuidanceSchema } from '../shared/semantics';
import { analyzeJevSemantics } from '../shared/semantic-judgment';
import { analysisFailureDetails } from '../shared/provider-contract';
import { createReleaseChecker } from "./updates";
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (_req, res) => res.json({ ...providerStatus(), profiles: configuredProfiles(), semantics: semanticProviderStatus() }));
const checkRelease = createReleaseChecker();
app.get("/api/updates", async (req, res) => {
  try { res.json(await checkRelease(req.query.fresh === "1")); }
  catch { res.status(502).json({ error: "更新检查暂不可用，请检查网络后重试，也可直接前往夸克网盘下载。" }); }
});
let calls = 0;
let windowAt = Date.now();
let active = 0;
const budgets = new Map<string, { count: number; at: number }>();
app.post(["/api/analyze", "/api/semantics", "/api/semantic-judgment"], async (req, res) => {
  const semantics = req.path === '/api/semantics';
  const judgment = req.path === '/api/semantic-judgment';
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== `${req.protocol}://${req.headers.host}` &&
    !["http://127.0.0.1:5178", "http://localhost:5178"].includes(origin)
  ) {
    res.status(403).json({ error: "请求来源不允许" });
    return;
  }
  const valid = requestSchema.safeParse(req.body);
  if (!valid.success || ((semantics || judgment) && valid.data.task !== 'other_messages')
    || (semantics && req.body.jevJudgments !== undefined && !semanticGuidanceSchema.safeParse(req.body.jevJudgments).success)
    || (judgment && !['typesafe', 'vercel', 'openrouter'].includes(req.body.judgeProvider))) {
    res.status(400).json({ error: "聊天结构或长度不符合要求，请校正后重试" });
    return;
  }
  let configuration;
  try {
    const selected = judgment ? req.body.judgeProvider : req.body.analysisProvider;
    configuration = semantics ? { ...semanticProviderStatus(), error: '请单独配置 DeepSeek 的 DEEPSEEK_API_KEY 后补充策略与潜台词。' }
      : selected ? { configured: true, ...getConfiguredProviderConfig(selected) } : providerStatus();
  } catch (error) { res.status(503).json({ error: error instanceof ConfigurationError ? error.message : '模型配置不可用。' }); return; }
  if (!configuration.configured) {
    res.status(503).json({ error: configuration.error });
    return;
  }
  const now = Date.now();
  if (now - windowAt > 3600000) {
    calls = 0;
    windowAt = now;
    budgets.clear();
  }
  const key = req.ip || "local";
  let entry = budgets.get(key);
  if (!entry || now - entry.at > 60000) {
    entry = { count: 0, at: now };
    budgets.set(key, entry);
  }
  if (entry.count >= 180 || calls >= 3000 || active >= 8) {
    res.setHeader(
      "Retry-After",
      String(
        calls >= 3000
          ? Math.max(1, Math.ceil((windowAt + 3600000 - now) / 1000))
          : Math.max(1, Math.ceil((entry.at + 60000 - now) / 1000)),
      ),
    );
    res.status(429).json({ error: "分析请求较多，已保留进度，请稍后继续" });
    return;
  }
  entry.count++;
  calls++;
  active++;
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    res.json(semantics ? await analyzeSemantics({ ...valid.data, ...(req.body.jevJudgments !== undefined ? { jevJudgments: req.body.jevJudgments } : {}) }, evaluateSemanticPayload, controller.signal)
      : judgment ? await analyzeJevSemantics(valid.data, req.body.judgeProvider,
        (payload, signal) => evaluate(payload, signal, getConfiguredProviderConfig(req.body.judgeProvider)), controller.signal)
      : await analyze(valid.data, controller.signal, req.body.analysisProvider));
  } catch (error) {
    const code = Number((error as { status?: number }).status) || 502;
    if (!res.headersSent && !controller.signal.aborted)
      res.status(code >= 400 && code < 600 ? code : 502).json({
        error:
          error instanceof ConfigurationError || error instanceof ProviderError
            ? error.message
            : providerErrorMessage(error),
        ...analysisFailureDetails(error),
        ...semanticFailureDetails(error),
        ...(error instanceof ProviderError && error.providerCode ? { code: error.providerCode } : {}),
      });
  } finally {
    active--;
  }
});
const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist");
app.use(express.static(dist));
app.get("/", (_req, res) => res.sendFile(join(dist, "index.html")));
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res
      .status(
        (err as { type?: string }).type === "entity.too.large" ? 413 : 400,
      )
      .json({ error: "输入格式或体积不受支持" });
  },
);
const port = Number(process.env.PORT || 3178);
app.listen(port, process.env.HOST || "127.0.0.1", () => {
  const status = providerStatus();
  console.log(`Conversation API: http://${process.env.HOST || "127.0.0.1"}:${port}`);
  console.log(
    status.configured
      ? `Jev: ${status.provider} · ${status.model} · Key configured (not yet verified)`
      : status.error,
  );
});
