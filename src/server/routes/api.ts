import { Hono } from "hono";
import type {
  BootstrapResponse,
  GameMode,
  GuessResponse,
  LeaderboardScope,
  LeaderboardResponse,
  ReportErrorResponse,
  RoundResponse,
  SubmitScoreResponse,
} from "../../shared/api";
import { recordMistake, reportQuestion } from "../core/analytics";
import { getModes, getRound } from "../core/data";
import { getLeaderboard, submitScore } from "../core/leaderboard";

export const api = new Hono();

function safeMode(value: string | undefined): GameMode {
  const modes = new Set<GameMode>(getModes());
  return modes.has(value as GameMode) ? (value as GameMode) : "mixed";
}

function safeScope(value: string | undefined): LeaderboardScope {
  return value === "today" ? "today" : "all";
}

api.get("/bootstrap", async (c) => {
  const scope = safeScope(c.req.query("scope"));
  const leaderboard = await getLeaderboard("mixed", scope, 8);
  return c.json<BootstrapResponse>({
    type: "bootstrap",
    leaderboard,
    modes: getModes(),
    scope,
  });
});

api.get("/leaderboard", async (c) => {
  const mode = safeMode(c.req.query("mode"));
  const scope = safeScope(c.req.query("scope"));
  const leaderboard = await getLeaderboard(mode, scope, 8);
  return c.json<LeaderboardResponse>({
    type: "leaderboard",
    leaderboard,
    scope,
  });
});

api.post("/round", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { mode?: GameMode };
    const round = await getRound(safeMode(body.mode));
    return c.json<RoundResponse>({
      type: "round",
      round,
    });
  } catch (error) {
    console.error("Failed to load game round", error);
    return c.json({ error: error instanceof Error ? error.message : "round_load_failed" }, 500);
  }
});

api.post("/guess", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      answer?: string;
      expected?: string;
      questionKey?: string;
      mode?: GameMode;
      continueGame?: boolean;
    };
    const correct = String(body.answer ?? "") === String(body.expected ?? "");
    if (!correct) {
      await recordMistake(String(body.questionKey ?? ""), String(body.answer ?? ""));
    }
    const nextRound = correct || body.continueGame ? await getRound(safeMode(body.mode)) : null;

    return c.json<GuessResponse>({
      type: "guess",
      correct,
      answer: String(body.expected ?? ""),
      nextRound,
    });
  } catch (error) {
    console.error("Failed to submit guess", error);
    return c.json({ error: error instanceof Error ? error.message : "guess_submit_failed" }, 500);
  }
});

api.post("/submit-score", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; score?: number; mode?: GameMode };
    const mode = safeMode(body.mode);
    const result = await submitScore(String(body.name ?? ""), Number(body.score ?? 0), mode);
    const leaderboard = await getLeaderboard(mode, "all", 8);
    return c.json<SubmitScoreResponse>({
      type: "submit_score",
      accepted: result.accepted,
      bestScore: result.bestScore,
      leaderboard,
    });
  } catch (error) {
    console.error("Failed to submit score", error);
    return c.json({ error: error instanceof Error ? error.message : "submit_score_failed" }, 500);
  }
});

api.post("/report-error", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { questionKey?: string; sampleId?: string };
    await reportQuestion(String(body.questionKey ?? ""), String(body.sampleId ?? ""));
    return c.json<ReportErrorResponse>({
      type: "report_error",
      reported: true,
    });
  } catch (error) {
    console.error("Failed to report question", error);
    return c.json({ error: error instanceof Error ? error.message : "report_failed" }, 500);
  }
});
