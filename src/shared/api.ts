export type GameMode =
  | "mixed"
  | "find_correct"
  | "match_pairs"
  | "memory"
  | "speed_round"
  | "higher_lower"
  | "broken_challenge";

export type PillSample = {
  id: string;
  logo: string;
  frontUrl: string;
  backUrl: string;
  glbUrl?: string;
  hasGlb: boolean;
  source: string;
  city: string;
  country: string;
  detected?: string;
  weightMg?: number | null;
  potencyScore?: number | null;
  potencyLabel?: string;
  mediaVersion?: string;
  alertDate?: string;
};

export type PillCard = {
  id: string;
  sample: PillSample;
};

export type RoundOption = {
  id: string;
  label: string;
};

export type FindCorrectRoundPayload = {
  kind: "find_correct";
  roundId: string;
  questionKey: string;
  mode: GameMode;
  prompt: string;
  answer: string;
  cards: PillCard[];
  targetLogo: string;
};

export type MatchPair = {
  label: string;
  sampleId: string;
};

export type MatchPairsRoundPayload = {
  kind: "match_pairs";
  roundId: string;
  questionKey: string;
  mode: GameMode;
  prompt: string;
  answer: string;
  cards: PillCard[];
  pairs: MatchPair[];
};

export type MemoryRoundPayload = {
  kind: "memory";
  roundId: string;
  questionKey: string;
  mode: GameMode;
  prompt: string;
  answer: string;
  cards: PillCard[];
  targetLogo: string;
  correctIndex: number;
};

export type SpeedRoundPayload = {
  kind: "speed_round";
  roundId: string;
  questionKey: string;
  mode: GameMode;
  prompt: string;
  answer: string;
  cards: PillCard[];
  targetLogo: string;
};

export type HigherLowerRoundPayload = {
  kind: "higher_lower";
  roundId: string;
  questionKey: string;
  mode: GameMode;
  prompt: string;
  answer: "left" | "right";
  cards: [PillCard, PillCard];
  metricLabel: string;
};

export type BrokenChallengeRoundPayload = {
  kind: "broken_challenge";
  roundId: string;
  questionKey: string;
  mode: GameMode;
  prompt: string;
  answer: string;
  options: RoundOption[];
  sample: PillSample;
  revealSteps: number[];
};

export type RoundPayload =
  | FindCorrectRoundPayload
  | MatchPairsRoundPayload
  | MemoryRoundPayload
  | SpeedRoundPayload
  | HigherLowerRoundPayload
  | BrokenChallengeRoundPayload;

export type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
};

export type LeaderboardScope = "today" | "all";

export type BootstrapResponse = {
  type: "bootstrap";
  leaderboard: LeaderboardEntry[];
  modes: GameMode[];
  scope: LeaderboardScope;
};

export type RoundResponse = {
  type: "round";
  round: RoundPayload;
};

export type GuessResponse = {
  type: "guess";
  correct: boolean;
  answer: string;
  nextRound: RoundPayload | null;
};

export type LeaderboardResponse = {
  type: "leaderboard";
  leaderboard: LeaderboardEntry[];
  scope: LeaderboardScope;
};

export type SubmitScoreResponse = {
  type: "submit_score";
  accepted: boolean;
  leaderboard: LeaderboardEntry[];
  bestScore: number;
};

export type ReportErrorResponse = {
  type: "report_error";
  reported: boolean;
};
