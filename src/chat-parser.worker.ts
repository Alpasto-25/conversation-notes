import { parseChat } from '../shared/parser';
const scope = self as unknown as { onmessage: (event: MessageEvent<{ raw: string }>) => void; postMessage: (result: unknown) => void };
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ ok: true, result: parseChat(data.raw) }); }
  catch { scope.postMessage({ ok: false }); }
};
