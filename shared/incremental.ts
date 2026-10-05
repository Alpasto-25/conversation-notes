import { boundedContext, relevantEvents, type MemoryEvent } from "./memory";
import type { Message, Relation, LineResult, AnalysisRequest } from "./types";
export function incrementalJobs(
  messages: Message[],
  relation: Relation,
  revision: number,
  lines: Record<string, LineResult>,
  events: Record<string, MemoryEvent>,
  changed: boolean,
  deepseek = false,
): AnalysisRequest[] {
  const recentIds = new Set(
    changed
      ? messages
          .slice(-20)
          .filter((m) => m.sender === "other")
          .map((m) => m.id)
      : [],
  );
  const jobs: AnalysisRequest[] = [];
  const historical = changed
    ? boundedContext(
        messages,
        Math.max(0, messages.length - 100),
        messages.length,
        events,
      )
    : undefined;
  if (historical)
    for (const e of relevantEvents(messages, events, messages.slice(-20)).slice(
      0,
      4,
    )) {
      if (
        historical.messages.some((m) => m.id === e.id && m.sender === "other")
      )
        jobs.push({
          task: "other_messages",
          targetIds: [e.id],
          ...historical,
          revision,
          relation,
        });
    }

  for (let start = 0; start < messages.length;) {
    let end = start,
      chars = 0;
    let otherCount = 0;
    while (end < messages.length && end - start < (deepseek ? 40 : 10)) {
      if (deepseek && messages[end].sender === "other" && otherCount === 20) break;
      const n = Array.from(messages[end].text).length;
      if (end > start && chars + n > (deepseek ? 3000 : 1500)) break;
      chars += n;
      if (messages[end].sender === "other") otherCount++;
      end++;
    }
    for (const sender of ["other", "self"] as const) {
      const targets = messages
        .slice(start, end)
        .filter(
          (m) =>
            m.sender === sender &&
            m.kind === "text" &&
            Array.from(m.text).length <= 12000 &&
            (!lines[m.id] || recentIds.has(m.id)),
        );
      if (!targets.length) continue;
      if (deepseek && sender === "self") {
        for (const target of targets) {
          const i = messages.findIndex(m => m.id === target.id);
          jobs.push({ task: "self_message", targetIds: [target.id],
            ...boundedContext(messages, Math.max(0, i - 99), i + 1, events, true), revision, relation });
        }
        continue;
      }
      const lastIndex = messages.findIndex((m) => m.id === targets.at(-1)!.id);
      // Revisit counterparts with a little later context; never expose future text to self ratings.
      const contextEnd =
        sender === "self" ? lastIndex + 1 : Math.min(messages.length, end + 20);
      let context = boundedContext(
        messages,
        Math.max(0, start - 80),
        contextEnd,
        events,
        sender === "self",
      );
      if (deepseek && sender === "other" && messages.length <= 100) {
        const scene = boundedContext(messages, 0, messages.length, events);
        if (scene.messages.length === messages.length) context = scene;
      }
      // Long contexts may omit early targets. Split those into individual bounded jobs.
      for (const target of targets.filter(
        (m) => !context.messages.some((c) => c.id === m.id),
      )) {
        const i = messages.findIndex((m) => m.id === target.id);
        jobs.push({
          task: sender === "self" ? "self_message" : "other_messages",
          targetIds: [target.id],
          ...boundedContext(messages, Math.max(0, i - 80), i + 1, events, true),
          revision,
          relation,
        });
      }
      const ids = targets
        .filter((m) => context.messages.some((c) => c.id === m.id))
        .map((m) => m.id);
      if (ids.length)
        jobs.push({
          task: sender === "self" ? "self_message" : "other_messages",
          targetIds: ids,
          ...context,
          revision,
          relation,
        });
    }
    start = end;
  }
  return jobs.reverse();
}
export function overviewJob(
  messages: Message[],
  relation: Relation,
  revision: number,
  events: Record<string, MemoryEvent>,
): AnalysisRequest {
  return {
    task: "overview",
    targetIds: [],
    revision,
    relation,
    ...boundedContext(
      messages,
      Math.max(0, messages.length - 100),
      messages.length,
      events,
    ),
  };
}
