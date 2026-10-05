// Seed each prompt family with two real jobs; no additional warm-up requests.
export async function runAnalysisQueue<T>(jobs: T[], execute: (job: T) => Promise<unknown>, active: () => boolean,
  seedKey?: (job: T) => string) {
  const queue = [...jobs];
  if (seedKey) {
    const seen = new Map<string, number>();
    for (const job of [...queue]) {
      if (!active()) return;
      const key = seedKey(job), count = seen.get(key) ?? 0;
      if (count >= 2) continue;
      queue.splice(queue.indexOf(job), 1);
      // A local hit is completed but cannot seed the provider's prefix cache.
      if (await execute(job) !== false) seen.set(key, count + 1);
    }
  }
  async function worker() {
    while (queue.length && active()) await execute(queue.shift()!);
  }
  await Promise.all([worker(), worker()]);
}
