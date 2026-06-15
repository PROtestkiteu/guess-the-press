import { redis } from "@devvit/redis";
import type { GameMode, LeaderboardEntry, LeaderboardScope } from "../../shared/api";

const NAME_KEY = "pillid:leaderboard:names";
const isLocalPreview = Boolean(process.env.LOCAL_STATIC_DIR);
const localSortedSets = new Map<string, Map<string, number>>();
const localNames = new Map<string, string>();

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function keyForMode(mode: GameMode, scope: LeaderboardScope): string {
  return scope === "today" ? `pillid:leaderboard:${mode}:today:${todayStamp()}` : `pillid:leaderboard:${mode}:all`;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 20);
}

function getLocalSet(key: string): Map<string, number> {
  let set = localSortedSets.get(key);
  if (!set) {
    set = new Map();
    localSortedSets.set(key, set);
  }
  return set;
}

function localLeaderboard(key: string, limit: number): LeaderboardEntry[] {
  return [...getLocalSet(key).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([member, score], index) => ({
      rank: index + 1,
      name: localNames.get(member) || member,
      score: Math.round(score),
    }));
}

export async function getLeaderboard(mode: GameMode, scope: LeaderboardScope, limit = 8): Promise<LeaderboardEntry[]> {
  const key = keyForMode(mode, scope);
  if (isLocalPreview) {
    return localLeaderboard(key, limit);
  }

  const rows = await redis.zRange(key, 0, limit - 1, { by: "rank", reverse: true });
  const names = await redis.hGetAll(NAME_KEY);

  return rows.map((row: { member: string; score: number }, index: number) => ({
    rank: index + 1,
    name: names[row.member] || row.member,
    score: Math.round(row.score),
  }));
}

export async function submitScore(nameInput: string, score: number, mode: GameMode): Promise<{ accepted: boolean; bestScore: number }> {
  const name = normalizeName(nameInput);
  if (!name || score <= 0) {
    return { accepted: false, bestScore: 0 };
  }

  const member = name.toLowerCase();
  if (isLocalPreview) {
    const allSet = getLocalSet(keyForMode(mode, "all"));
    const todaySet = getLocalSet(keyForMode(mode, "today"));
    const previous = allSet.get(member) ?? 0;
    const bestScore = Math.max(previous, score);
    const accepted = bestScore > previous;
    localNames.set(member, name);
    allSet.set(member, bestScore);
    todaySet.set(member, Math.max(todaySet.get(member) ?? 0, score));
    return { accepted, bestScore };
  }

  const allKey = keyForMode(mode, "all");
  const todayKey = keyForMode(mode, "today");
  const previous = await redis.zScore(allKey, member);
  const bestScore = Math.max(previous ?? 0, score);
  const accepted = bestScore > (previous ?? 0);
  const previousToday = await redis.zScore(todayKey, member);

  await redis.hSet(NAME_KEY, { [member]: name });
  await redis.zAdd(allKey, { member, score: bestScore });
  await redis.zAdd(todayKey, { member, score: Math.max(previousToday ?? 0, score) });

  return { accepted, bestScore };
}
