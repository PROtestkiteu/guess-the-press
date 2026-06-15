import type {
  BrokenChallengeRoundPayload,
  FindCorrectRoundPayload,
  GameMode,
  HigherLowerRoundPayload,
  MatchPairsRoundPayload,
  MemoryRoundPayload,
  PillCard,
  PillSample,
  RoundOption,
  RoundPayload,
  SpeedRoundPayload,
} from "../../shared/api";
import bundledDemo from "./bundledDemo.generated.json";
import localBank from "./localBank.generated.json";

const bundledSamples: PillSample[] = bundledDemo as PillSample[];
const fallbackSamples: PillSample[] = [...bundledSamples, ...(localBank as PillSample[])];
const FIND_COUNTS = [4, 6, 9];
const PAIR_COUNTS = [3, 4];
const MEMORY_REVEAL_STEPS = [22, 36, 52, 72, 100];
const brokenFallbackChoices = ["Rolex", "Superman", "Ferrari", "Crown", "Red Bull", "Audi", "Tesla"];
const MIXED_SEQUENCE: GameMode[] = ["find_correct", "match_pairs", "memory", "higher_lower", "broken_challenge", "speed_round"];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i]!, copy[j]!] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function uniqueLogos(samples: PillSample[]): string[] {
  return [...new Set(samples.map((sample) => sample.logo).filter(Boolean))];
}

function normalizeLogoValue(value: string | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getActiveSamples(): PillSample[] {
  return fallbackSamples;
}

function chooseSample(excludedIds: string[] = []): PillSample {
  const active = getActiveSamples();
  const pool = active.filter((sample) => !excludedIds.includes(sample.id));
  return pool[Math.floor(Math.random() * pool.length)] ?? active[0] ?? fallbackSamples[0]!;
}

function takeDistinctSamples(
  count: number,
  filters: ((sample: PillSample) => boolean)[] = [],
  options: { dedupeByLogo?: boolean } = {},
): PillSample[] {
  const active = shuffle(getActiveSamples());
  const results: PillSample[] = [];
  const seenIds = new Set<string>();
  const seenLogos = new Set<string>();

  for (const sample of active) {
    if (seenIds.has(sample.id)) continue;
    if (filters.some((filter) => !filter(sample))) continue;
    if (options.dedupeByLogo) {
      const logoKey = normalizeLogoValue(sample.logo);
      if (logoKey && seenLogos.has(logoKey)) continue;
    }
    results.push(sample);
    seenIds.add(sample.id);
    if (options.dedupeByLogo) {
      const logoKey = normalizeLogoValue(sample.logo);
      if (logoKey) seenLogos.add(logoKey);
    }
    if (results.length >= count) break;
  }

  let attempts = 0;
  while (results.length < count && attempts < active.length * 2) {
    attempts += 1;
    const sample = chooseSample([...seenIds]);
    if (!sample || seenIds.has(sample.id)) break;
    if (filters.some((filter) => !filter(sample))) continue;
    if (options.dedupeByLogo) {
      const logoKey = normalizeLogoValue(sample.logo);
      if (logoKey && seenLogos.has(logoKey)) continue;
      if (logoKey) seenLogos.add(logoKey);
    }
    results.push(sample);
    seenIds.add(sample.id);
  }

  return results;
}

function createCards(samples: PillSample[]): PillCard[] {
  return samples.map((sample) => ({ id: sample.id, sample }));
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function extractPotency(sample: PillSample): { score: number; label: string } | null {
  if (typeof sample.potencyScore === "number" && Number.isFinite(sample.potencyScore)) {
    return {
      score: sample.potencyScore,
      label: sample.potencyLabel || `${Math.round(sample.potencyScore)} strength points`,
    };
  }

  const detected = String(sample.detected || "");
  const match = detected.match(/(\d+(?:[.,]\d+)?)\s*(mg|µg|%)/i);
  if (match) {
    const value = Number((match[1] ?? "").replace(",", "."));
    const unit = (match[2] ?? "").toLowerCase();
    const normalized = unit === "µg" ? value / 10 : value;
    return { score: normalized, label: `${match[1] ?? ""}${match[2] ?? ""}` };
  }

  if (typeof sample.weightMg === "number" && Number.isFinite(sample.weightMg)) {
    return { score: sample.weightMg, label: `${Math.round(sample.weightMg)}mg weight` };
  }

  return null;
}

function buildFindCorrectRound(mode: GameMode): FindCorrectRoundPayload {
  const count = FIND_COUNTS[Math.floor(Math.random() * FIND_COUNTS.length)]!;
  const samples = takeDistinctSamples(count, [(sample) => Boolean(sample.logo)], { dedupeByLogo: true });
  const target = samples[Math.floor(Math.random() * samples.length)] ?? chooseSample();
  const cards = createCards(shuffle(samples));

  return {
    kind: "find_correct",
    roundId: randomId("find"),
    questionKey: `find:${target.id}`,
    mode,
    prompt: `Which one is the ${target.logo}?`,
    answer: target.id,
    cards,
    targetLogo: target.logo,
  };
}

function buildMatchPairsRound(mode: GameMode): MatchPairsRoundPayload {
  const desiredCount = PAIR_COUNTS[Math.floor(Math.random() * PAIR_COUNTS.length)]!;
  const logoToSample = new Map<string, PillSample>();

  for (const sample of shuffle(getActiveSamples())) {
    const logoKey = normalizeLogoValue(sample.logo);
    if (!logoKey || logoToSample.has(logoKey)) continue;
    logoToSample.set(logoKey, sample);
    if (logoToSample.size >= desiredCount) break;
  }

  const samples = [...logoToSample.values()];
  const labelOrder = shuffle(samples);
  const cardOrder = shuffle(samples);
  const pairs = labelOrder.map((sample) => ({
    label: sample.logo,
    sampleId: sample.id,
  }));

  return {
    kind: "match_pairs",
    roundId: randomId("match"),
    questionKey: `match:${samples.map((sample) => sample.id).join(":")}`,
    mode,
    prompt: "Match each logo name to the correct pill photo.",
    answer: pairs.map((pair) => `${pair.label}:${pair.sampleId}`).join("|"),
    cards: createCards(cardOrder),
    pairs,
  };
}

function buildMemoryRound(mode: GameMode): MemoryRoundPayload {
  const samples = takeDistinctSamples(9, [(sample) => Boolean(sample.logo)], { dedupeByLogo: true });
  const cards = createCards(shuffle(samples));
  const correctIndex = Math.floor(Math.random() * cards.length);
  const target = cards[correctIndex]!;

  return {
    kind: "memory",
    roundId: randomId("memory"),
    questionKey: `memory:${target.sample.id}`,
    mode,
    prompt: `Where was the ${target.sample.logo}?`,
    answer: target.id,
    cards,
    targetLogo: target.sample.logo,
    correctIndex,
  };
}

function buildSpeedRound(mode: GameMode): SpeedRoundPayload {
  const baseRound = buildFindCorrectRound(mode);
  return {
    kind: "speed_round",
    roundId: randomId("speed"),
    questionKey: `speed:${baseRound.questionKey}`,
    mode,
    prompt: `Which is ${baseRound.targetLogo}?`,
    answer: baseRound.answer,
    cards: baseRound.cards,
    targetLogo: baseRound.targetLogo,
  };
}

function buildHigherLowerRound(mode: GameMode): HigherLowerRoundPayload {
  const candidates = shuffle(
    getActiveSamples().filter((sample) => Boolean(sample.logo) && Boolean(extractPotency(sample))),
  );
  let left = candidates[0];
  let right = candidates.find((sample) => sample.id !== left?.id && normalizeLogoValue(sample.logo) !== normalizeLogoValue(left?.logo));

  if (!left || !right) {
    const fallback = takeDistinctSamples(2, [(sample) => Boolean(sample.logo)], { dedupeByLogo: true });
    left = fallback[0];
    right = fallback[1] ?? fallback[0];
  }

  const leftPotency = extractPotency(left!);
  const rightPotency = extractPotency(right!);
  const answer = (leftPotency?.score ?? 0) >= (rightPotency?.score ?? 0) ? "left" : "right";
  const metricLabel = leftPotency?.label?.includes("%") || rightPotency?.label?.includes("%") ? "reported purity" : "reported strength";

  return {
    kind: "higher_lower",
    roundId: randomId("higher"),
    questionKey: `higher:${left!.id}:${right!.id}`,
    mode,
    prompt: `Which one was more often reported stronger by ${metricLabel}?`,
    answer,
    cards: createCards([left!, right!]) as [PillCard, PillCard],
    metricLabel,
  };
}

function buildBrokenChallengeRound(mode: GameMode): BrokenChallengeRoundPayload {
  const sample = chooseSample();
  const logos = uniqueLogos(getActiveSamples());
  const distractors = shuffle(
    [...new Set([...logos, ...brokenFallbackChoices])].filter((label) => label && label !== sample.logo),
  ).slice(0, 3);
  const options: RoundOption[] = shuffle([sample.logo, ...distractors]).map((label, index) => ({
    id: `${label}-${index}`,
    label,
  }));

  return {
    kind: "broken_challenge",
    roundId: randomId("broken"),
    questionKey: `broken:${sample.id}`,
    mode,
    prompt: "What logo is this?",
    answer: sample.logo,
    options,
    sample,
    revealSteps: MEMORY_REVEAL_STEPS,
  };
}

export function getModes(): GameMode[] {
  return ["mixed", ...MIXED_SEQUENCE];
}

export async function getRound(mode: GameMode): Promise<RoundPayload> {
  if (mode === "mixed") return buildFindCorrectRound("mixed");
  if (mode === "find_correct") return buildFindCorrectRound(mode);
  if (mode === "match_pairs") return buildMatchPairsRound(mode);
  if (mode === "memory") return buildMemoryRound(mode);
  if (mode === "speed_round") return buildSpeedRound(mode);
  if (mode === "higher_lower") return buildHigherLowerRound(mode);
  return buildBrokenChallengeRound(mode);
}
