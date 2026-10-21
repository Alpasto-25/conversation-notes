import { planAnalysis } from './analysis-plan';
type Arguments = Parameters<typeof planAnalysis>;
const scope = self as unknown as { onmessage: (event: MessageEvent<Arguments>) => void; postMessage: (value: unknown) => void };
scope.onmessage = ({ data }) => { try { scope.postMessage({ ok: true, plan: planAnalysis(...data) }); } catch { scope.postMessage({ ok: false }); } };
