import { redis } from "@devvit/redis";
const isLocalPreview = Boolean(process.env.LOCAL_STATIC_DIR);
const localMistakes = new Map<string, Map<string, number>>();
const localReports = new Map<string, string>();

function mistakesKey(questionKey: string): string {
  return `pillid:mistakes:${questionKey}`;
}

export async function recordMistake(questionKey: string, chosenAnswer: string): Promise<void> {
  if (!questionKey || !chosenAnswer) return;
  if (isLocalPreview) {
    let bucket = localMistakes.get(questionKey);
    if (!bucket) {
      bucket = new Map();
      localMistakes.set(questionKey, bucket);
    }
    bucket.set(chosenAnswer, (bucket.get(chosenAnswer) ?? 0) + 1);
    return;
  }
  await redis.hIncrBy(mistakesKey(questionKey), chosenAnswer, 1);
}

export async function getPreferredDistractor(
  questionKey: string,
  answer: string,
  available: string[],
): Promise<string | null> {
  if (!questionKey) return null;
  if (isLocalPreview) {
    const counts = localMistakes.get(questionKey) ?? new Map<string, number>();
    let best: { label: string; count: number } | null = null;
    for (const label of available) {
      if (label === answer) continue;
      const count = counts.get(label) ?? 0;
      if (count < 2) continue;
      if (!best || count > best.count) best = { label, count };
    }
    return best?.label ?? null;
  }
  const counts = await redis.hGetAll(mistakesKey(questionKey));
  let best: { label: string; count: number } | null = null;

  for (const label of available) {
    if (label === answer) continue;
    const count = Number(counts[label] ?? 0);
    if (count < 5) continue;
    if (!best || count > best.count) {
      best = { label, count };
    }
  }

  return best?.label ?? null;
}

export async function reportQuestion(questionKey: string, sampleId: string): Promise<void> {
  if (!questionKey) return;
  if (isLocalPreview) {
    localReports.set(
      questionKey,
      JSON.stringify({
        sampleId,
        reportedAt: new Date().toISOString(),
      }),
    );
    return;
  }
  await redis.hIncrBy("pillid:reports:counts", sampleId || questionKey, 1);
  await redis.hSet("pillid:reports:meta", {
    [questionKey]: JSON.stringify({
      sampleId,
      reportedAt: new Date().toISOString(),
    }),
  });
}
