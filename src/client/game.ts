import type {
  BootstrapResponse,
  BrokenChallengeRoundPayload,
  FindCorrectRoundPayload,
  GameMode,
  GuessResponse,
  HigherLowerRoundPayload,
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardResponse,
  MatchPairsRoundPayload,
  MemoryRoundPayload,
  PillCard,
  ReportErrorResponse,
  RoundPayload,
  RoundResponse,
  SpeedRoundPayload,
  SubmitScoreResponse,
} from "../shared/api";
import boardFacts from "./boardFacts.generated";

type ApiErrorResponse = { error?: string };

const startScreenEl = document.getElementById("start-screen") as HTMLDivElement;
const gameScreenEl = document.getElementById("game-screen") as HTMLDivElement;
const finishScreenEl = document.getElementById("finish-screen") as HTMLDivElement;
const leaderboardListEl = document.getElementById("leaderboard-list") as HTMLDivElement;
const finishLeaderboardListEl = document.getElementById("finish-leaderboard-list") as HTMLDivElement;
const resultStripEl = document.getElementById("result-strip") as HTMLDivElement;
const answersEl = document.getElementById("answers") as HTMLDivElement;
const scoreValueEl = document.getElementById("score-value") as HTMLSpanElement;
const scoreMultiplierEl = document.getElementById("score-multiplier") as HTMLSpanElement;
const reportErrorEl = document.getElementById("report-error") as HTMLButtonElement;
const timerCardEl = document.getElementById("timer-card") as HTMLDivElement;
const timerValueEl = document.getElementById("timer-value") as HTMLSpanElement;
const menuButtonEl = document.getElementById("menu-button") as HTMLButtonElement;
const progressTrackEl = document.getElementById("progress-track") as HTMLDivElement;
const progressBarEl = document.getElementById("progress-bar") as HTMLDivElement;
const progressBonusEl = document.getElementById("progress-bonus") as HTMLDivElement;
const boardStageEl = document.getElementById("board-stage") as HTMLDivElement;
const boardOverlayEl = document.getElementById("board-overlay") as HTMLDivElement;
const boardHintEl = document.getElementById("board-hint") as HTMLDivElement;
const nameDialogBackdropEl = document.getElementById("name-dialog-backdrop") as HTMLDivElement;
const nameFormEl = document.getElementById("name-form") as HTMLFormElement;
const playerNameEl = document.getElementById("player-name") as HTMLInputElement;
const skipSaveEl = document.getElementById("skip-save") as HTMLButtonElement;
const finishTitleEl = document.getElementById("finish-title") as HTMLHeadingElement;
const finishScoreEl = document.getElementById("finish-score") as HTMLDivElement;
const finishCopyEl = document.getElementById("finish-copy") as HTMLParagraphElement;
const playAgainEl = document.getElementById("play-again") as HTMLButtonElement;
const playButtonEl = document.getElementById("play-button") as HTMLButtonElement;
const viewerStageEl = document.querySelector(".viewer-stage") as HTMLDivElement;
const viewerFooterEl = document.querySelector(".viewer-footer") as HTMLDivElement;

const modeOptionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-select-mode]"));
const scopeToggleButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-scope]"));
const mixedSequence: GameMode[] = ["find_correct", "match_pairs", "memory", "higher_lower", "broken_challenge", "speed_round"];

let currentRound: RoundPayload | null = null;
let selectedGameMode: GameMode = "mixed";
let selectedLeaderboardScope: LeaderboardScope = "all";
let isSubmitting = false;
let score = 0;
let timeLimit = 0;
let timeLeft = 0;
let timerDeadline = 0;
let timerHandle = 0;
let pendingGameOver = false;
let prefetchedRound: RoundPayload | null = null;
let prefetchedRoundMode: GameMode | null = null;
let memoryRevealHandle = 0;
let memoryLocked = false;
let brokenRevealIndex = 0;
let matchSelectionLabel: string | null = null;
let matchSelectionSampleId: string | null = null;
let matchedLabels = new Set<string>();
let matchedSampleIds = new Set<string>();
let mixedSequenceIndex = 0;
const warmedImageUrls = new Set<string>();
let lastBoardFact = "";
let multiplierBase = 1;
let multiplierBonus = 0;
let multiplierActive = false;
let meterAnsweringActive = false;
let meterFrameHandle = 0;
let meterLastTick = 0;
let roundCount = 0;
let lastSubmittedName = "";
let lastSubmittedScore = 0;

const BASE_DRAIN_SECONDS = 30;
const METER_STEP = 1 / 3;

function syncViewportState(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  document.documentElement.dataset.viewport = width < 520 || height < 720 ? "compact" : "regular";
}

function screenOnly(screen: "start" | "game" | "finish"): void {
  startScreenEl.classList.toggle("is-active", screen === "start");
  gameScreenEl.classList.toggle("is-active", screen === "game");
  finishScreenEl.classList.toggle("is-active", screen === "finish");
}

function getVisibleLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  if (entries.length <= 5) return entries;
  if (!lastSubmittedName || lastSubmittedScore <= 0) {
    return entries.slice(0, 5);
  }

  const currentIndex = entries.findIndex(
    (entry) => entry.name === lastSubmittedName && entry.score === lastSubmittedScore,
  );
  if (currentIndex < 0 || currentIndex < 4) {
    return entries.slice(0, 5);
  }

  return [...entries.slice(0, 4), entries[currentIndex]!];
}

function renderLeaderboard(target: HTMLDivElement, entries: LeaderboardEntry[]): void {
  target.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "leaderboard-empty";
    empty.textContent = "No scores yet. Be the first name on the board.";
    target.appendChild(empty);
    return;
  }

  for (const entry of getVisibleLeaderboardEntries(entries)) {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML = `
      <span class="leaderboard-rank">${entry.rank}</span>
      <span class="leaderboard-name">${entry.name}</span>
      <span class="leaderboard-score">${entry.score}</span>
    `;
    target.appendChild(row);
  }
}

function syncSelectedModeUi(): void {
  playButtonEl.textContent = "Play";
  modeOptionButtons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.selectMode === selectedGameMode);
  });
}

function usePortraitMatchLayout(): boolean {
  return window.innerWidth <= 560 && window.innerHeight > window.innerWidth;
}

function getScoreMultiplier(): number {
  return multiplierActive ? 2 : 1;
}

function syncScoreUi(): void {
  scoreValueEl.textContent = String(score);
  scoreMultiplierEl.textContent = `x${getScoreMultiplier()}`;
  scoreMultiplierEl.hidden = !multiplierActive;
  scoreMultiplierEl.classList.toggle("is-active", multiplierActive);
}

function fitBoardToViewport(): void {
  if (!currentRound) return;
  const stageHeight = viewerStageEl.clientHeight;
  const topbarHeight = viewerStageEl.querySelector<HTMLElement>(".viewer-topbar")?.offsetHeight ?? 0;
  const questionHeight = resultStripEl.offsetHeight;
  const answersHeight = answersEl.hidden ? 0 : answersEl.offsetHeight;
  const stageStyles = window.getComputedStyle(viewerStageEl);
  const gap = Number.parseFloat(stageStyles.rowGap || stageStyles.gap || "0") || 0;
  const footerHeight = viewerFooterEl.offsetHeight;
  const available = Math.max(120, stageHeight - topbarHeight - questionHeight - answersHeight - footerHeight - gap * 3 - 24);

  boardStageEl.style.setProperty("--board-height", `${available}px`);
  boardStageEl.style.height = `${available}px`;

  if (currentRound.kind === "find_correct" || currentRound.kind === "speed_round") {
    const columns = currentRound.cards.length >= 9 ? 3 : 2;
    const rows = Math.ceil(currentRound.cards.length / columns);
    const rowHeight = Math.max(56, Math.floor((available - gap * (rows - 1)) / rows));
    boardStageEl.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    boardStageEl.style.gridTemplateRows = `repeat(${rows}, minmax(0, ${rowHeight}px))`;
    return;
  }

  if (currentRound.kind === "memory") {
    const rowHeight = Math.max(44, Math.floor((available - gap * 2) / 3));
    boardStageEl.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    boardStageEl.style.gridTemplateRows = `repeat(3, minmax(0, ${rowHeight}px))`;
    return;
  }

  if (currentRound.kind === "higher_lower") {
    boardStageEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    boardStageEl.style.gridTemplateRows = `minmax(0, ${available}px)`;
    return;
  }

  if (currentRound.kind === "match_pairs") {
    const labelsColumn = boardStageEl.querySelector<HTMLDivElement>(".match-labels");
    const cardsColumn = boardStageEl.querySelector<HTMLDivElement>(".match-cards");
    const portraitLayout = usePortraitMatchLayout();
    const matchCardColumns = portraitLayout ? 1 : 2;
    const rows = portraitLayout ? currentRound.pairs.length : Math.ceil(currentRound.cards.length / matchCardColumns);
    const rowHeight = Math.max(portraitLayout ? 81 : 36, Math.floor((available - gap * (rows - 1)) / rows));
    const rowTemplate = portraitLayout
      ? `repeat(${rows}, minmax(81px, ${rowHeight}px))`
      : `repeat(${rows}, minmax(0, ${rowHeight}px))`;
    boardStageEl.style.gridTemplateColumns = usePortraitMatchLayout()
      ? "repeat(2, minmax(0, 1fr))"
      : "minmax(140px, 220px) minmax(0, 1fr)";
    boardStageEl.style.gridTemplateRows = rowTemplate;
    if (labelsColumn) {
      labelsColumn.style.gridTemplateRows = rowTemplate;
    }
    if (cardsColumn) {
      cardsColumn.style.gridTemplateColumns = `repeat(${matchCardColumns}, minmax(0, 1fr))`;
      cardsColumn.style.gridTemplateRows = rowTemplate;
    }
    return;
  }

  if (currentRound.kind === "broken_challenge") {
    boardStageEl.style.gridTemplateColumns = "minmax(0, 1fr)";
    boardStageEl.style.gridTemplateRows = `minmax(0, ${available}px)`;
  }
}

function syncLeaderboardScopeUi(): void {
  scopeToggleButtons.forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.scope === selectedLeaderboardScope);
  });
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as ApiErrorResponse).error || "request_failed")
        : `request_failed_${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

async function fetchBootstrap(): Promise<void> {
  const payload = await apiJson<BootstrapResponse>(`/api/bootstrap?scope=${selectedLeaderboardScope}`);
  selectedLeaderboardScope = payload.scope;
  renderLeaderboard(leaderboardListEl, payload.leaderboard);
  syncSelectedModeUi();
  syncLeaderboardScopeUi();
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const payload = await apiJson<LeaderboardResponse>(`/api/leaderboard?mode=${selectedGameMode}&scope=${selectedLeaderboardScope}`);
  selectedLeaderboardScope = payload.scope;
  syncLeaderboardScopeUi();
  return payload.leaderboard;
}

function getRequestedRoundMode(consume = false): GameMode {
  if (selectedGameMode !== "mixed") return selectedGameMode;
  const mode = mixedSequence[mixedSequenceIndex % mixedSequence.length] ?? "find_correct";
  if (consume) {
    mixedSequenceIndex += 1;
  }
  return mode;
}

async function fetchRound(mode: GameMode): Promise<void> {
  const payload = await apiJson<RoundResponse>("/api/round", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  renderRound(payload.round);
}

function getRoundImageUrls(round: RoundPayload): string[] {
  if (round.kind === "broken_challenge") {
    return round.sample.frontUrl ? [round.sample.frontUrl] : [];
  }

  if (round.kind === "higher_lower") {
    return round.cards.map((card) => card.sample.frontUrl).filter(Boolean);
  }

  return round.cards.map((card) => card.sample.frontUrl).filter(Boolean);
}

async function preloadImageUrl(url: string): Promise<void> {
  if (!url || warmedImageUrls.has(url)) return;

  await new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });

  warmedImageUrls.add(url);
}

async function warmRoundAssets(round: RoundPayload): Promise<void> {
  const urls = getRoundImageUrls(round);
  if (!urls.length) return;
  await Promise.all(urls.map((url) => preloadImageUrl(url)));
}

async function prefetchRound(mode: GameMode): Promise<void> {
  try {
    const payload = await apiJson<RoundResponse>("/api/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    await warmRoundAssets(payload.round);
    prefetchedRound = payload.round;
    prefetchedRoundMode = mode;
  } catch {
    prefetchedRound = null;
    prefetchedRoundMode = null;
  }
}

function stopTimer(): void {
  window.clearInterval(timerHandle);
  window.clearTimeout(memoryRevealHandle);
  if (meterFrameHandle) {
    window.cancelAnimationFrame(meterFrameHandle);
    meterFrameHandle = 0;
  }
  meterAnsweringActive = false;
  meterLastTick = 0;
}

function clearBoardState(): void {
  boardStageEl.replaceChildren();
  boardStageEl.style.removeProperty("--board-height");
  boardStageEl.style.height = "";
  boardStageEl.style.gridTemplateRows = "";
  boardStageEl.style.gridTemplateColumns = "";
  answersEl.replaceChildren();
  answersEl.hidden = true;
  boardOverlayEl.hidden = true;
  boardOverlayEl.textContent = "";
  boardHintEl.textContent = "";
  boardHintEl.hidden = true;
  boardStageEl.className = "board-stage";
  answersEl.className = "answers";
  matchSelectionLabel = null;
  matchSelectionSampleId = null;
  matchedLabels = new Set<string>();
  matchedSampleIds = new Set<string>();
  memoryLocked = false;
  brokenRevealIndex = 0;
}

function getCurrentDrainSeconds(): number {
  return Math.max(10, BASE_DRAIN_SECONDS - Math.max(0, roundCount - 1) * 1.5);
}

function updateMeterUi(): void {
  progressBarEl.style.width = `${Math.max(0, Math.min(100, multiplierBase * 100))}%`;
  progressBonusEl.style.width = `${Math.max(0, Math.min(100, multiplierBonus * 100))}%`;
  progressTrackEl.classList.toggle("is-multiplier", multiplierActive && multiplierBonus > 0.001);
  syncScoreUi();
}

function setAnsweringState(active: boolean): void {
  if (meterAnsweringActive === active) return;
  meterAnsweringActive = active;

  if (!active) {
    if (meterFrameHandle) {
      window.cancelAnimationFrame(meterFrameHandle);
      meterFrameHandle = 0;
    }
    meterLastTick = 0;
    return;
  }

  const tick = (now: number): void => {
    if (!meterAnsweringActive) {
      meterFrameHandle = 0;
      meterLastTick = 0;
      return;
    }

    if (!meterLastTick) {
      meterLastTick = now;
    } else {
      const deltaSeconds = (now - meterLastTick) / 1000;
      meterLastTick = now;
      const drain = deltaSeconds / getCurrentDrainSeconds();

      if (multiplierActive && multiplierBonus > 0) {
        multiplierBonus = Math.max(0, multiplierBonus - drain);
        if (multiplierBonus <= 0.001) {
          multiplierBonus = 0;
          multiplierActive = false;
        }
      } else {
        multiplierBase = Math.max(0, multiplierBase - drain);
      }

      updateMeterUi();
    }

    meterFrameHandle = window.requestAnimationFrame(tick);
  };

  meterFrameHandle = window.requestAnimationFrame(tick);
}

function applyMeterDelta(delta: number): void {
  if (delta > 0) {
    if (multiplierBase < 1) {
      const fill = Math.min(delta, 1 - multiplierBase);
      multiplierBase += fill;
      delta -= fill;
    }
    if (delta > 0) {
      multiplierActive = true;
      multiplierBonus = Math.min(1, multiplierBonus + delta);
    }
  } else if (delta < 0) {
    let remainingPenalty = Math.abs(delta);
    if (multiplierActive && multiplierBonus > 0) {
      const fromBonus = Math.min(remainingPenalty, multiplierBonus);
      multiplierBonus -= fromBonus;
      remainingPenalty -= fromBonus;
      if (multiplierBonus <= 0.001) {
        multiplierBonus = 0;
        multiplierActive = false;
      }
    }
    if (remainingPenalty > 0) {
      multiplierBase = Math.max(0, multiplierBase - remainingPenalty);
    }
  }

  if (multiplierBonus <= 0.001) {
    multiplierBonus = 0;
    multiplierActive = false;
  }
  updateMeterUi();
}

function grantFullMultiplier(): void {
  multiplierBase = 1;
  multiplierActive = true;
  multiplierBonus = 1;
  updateMeterUi();
}

function removeBonusProgress(): void {
  multiplierBonus = 0;
  multiplierActive = false;
  updateMeterUi();
}

function resetForMode(mode: GameMode): void {
  stopTimer();
  selectedGameMode = mode;
  syncSelectedModeUi();
  score = 0;
  timeLimit = 0;
  timeLeft = 0;
  mixedSequenceIndex = 0;
  roundCount = 0;
  pendingGameOver = false;
  isSubmitting = false;
  multiplierBase = 1;
  multiplierBonus = 0;
  multiplierActive = false;
  syncScoreUi();
  timerValueEl.textContent = "--";
  resultStripEl.textContent = "Loading round...";
  currentRound = null;
  clearBoardState();
  updateMeterUi();
}

function setBoardHint(_text = "", _visible = false): void {
  boardHintEl.textContent = "";
  boardHintEl.hidden = true;
}

function pickBoardFact(): string {
  if (!boardFacts.length) return "";

  let nextFact = boardFacts[Math.floor(Math.random() * boardFacts.length)]!;
  if (nextFact === lastBoardFact) {
    const fallback = boardFacts.find((fact) => fact !== lastBoardFact);
    if (fallback) nextFact = fallback;
  }
  lastBoardFact = nextFact;
  return nextFact;
}

function showBoardFact(): void {
  const fact = pickBoardFact();
  setBoardHint(fact, Boolean(fact));
}

function buildCardButton(card: PillCard, label?: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pill-card";
  button.dataset.cardId = card.id;

  const image = document.createElement("img");
  image.src = card.sample.frontUrl;
  image.alt = card.sample.logo || "Pill";
  button.appendChild(image);

  const meta = document.createElement("div");
  meta.className = "pill-card-meta";
  const location = [card.sample.city, card.sample.country].filter(Boolean).join(", ") || card.sample.source || "Sample";
  const detected = card.sample.detected || card.sample.potencyLabel || "Substances unknown";
  meta.innerHTML = `
    <strong>${label || card.sample.logo || "Unknown"}</strong>
    <span>${location}</span>
    <span class="pill-card-detected">${detected}</span>
  `;
  button.appendChild(meta);
  return button;
}

function getCorrectAnswerLabel(round: RoundPayload): string {
  if (round.kind === "find_correct" || round.kind === "speed_round" || round.kind === "memory") {
    return round.targetLogo;
  }
  if (round.kind === "higher_lower") {
    const card = round.answer === "left" ? round.cards[0] : round.cards[1];
    return card?.sample.logo || round.answer;
  }
  if (round.kind === "broken_challenge") {
    return round.answer;
  }
  if (round.kind === "match_pairs") {
    return "the matching pill";
  }
  return "";
}

function highlightCorrectAnswer(round: RoundPayload): void {
  if (round.kind === "find_correct" || round.kind === "speed_round" || round.kind === "memory") {
    const correctButton = boardStageEl.querySelector<HTMLButtonElement>(`.pill-card[data-card-id="${CSS.escape(round.answer)}"]`);
    if (round.kind === "memory") {
      correctButton?.classList.remove("pill-card--memory");
    }
    correctButton?.classList.add("is-answer");
    return;
  }

  if (round.kind === "higher_lower") {
    const index = round.answer === "left" ? 0 : 1;
    const correctButton = boardStageEl.querySelectorAll<HTMLButtonElement>(".pill-card")[index];
    correctButton?.classList.add("is-answer");
    return;
  }

  if (round.kind === "broken_challenge") {
    const correctButton = Array.from(answersEl.querySelectorAll<HTMLButtonElement>(".answer-chip")).find(
      (chip) => chip.textContent?.trim() === round.answer,
    );
    correctButton?.classList.add("is-answer");
    return;
  }

  if (round.kind === "match_pairs" && matchSelectionLabel) {
    const expectedSampleId = round.pairs.find((pair) => pair.label === matchSelectionLabel)?.sampleId;
    if (!expectedSampleId) return;
    const correctButton = boardStageEl.querySelector<HTMLButtonElement>(`.pill-card[data-card-id="${CSS.escape(expectedSampleId)}"]`);
    correctButton?.classList.add("is-answer");
    const correctChip = boardStageEl.querySelector<HTMLButtonElement>(`.answer-chip[data-label="${CSS.escape(matchSelectionLabel)}"]`);
    correctChip?.classList.add("is-answer");
  }
}

function updateProgress(value: number): void {
  timerValueEl.textContent = `${Math.max(0, value).toFixed(1)}s`;
}

function setupSpeedTimer(): void {
  if (currentRound?.kind !== "speed_round") {
    timerCardEl.style.display = "none";
    return;
  }

  timerCardEl.style.display = "flex";
  if (!timeLimit) {
    timeLimit = 30;
    timeLeft = 30;
  }
  timerDeadline = Date.now() + timeLeft * 1000;
  window.clearInterval(timerHandle);
  timerHandle = window.setInterval(() => {
    timeLeft = Math.max(0, (timerDeadline - Date.now()) / 1000);
    updateProgress(timeLeft);
    if (timeLeft <= 0.02) {
      stopTimer();
      void openNameDialog();
    }
  }, 60);
}

function renderFindBoard(round: FindCorrectRoundPayload | SpeedRoundPayload): void {
  boardStageEl.classList.add("board-stage--grid");
  boardStageEl.classList.toggle("board-stage--grid-9", round.cards.length >= 9);
  const columns = round.cards.length >= 9 ? 3 : 2;
  const rows = Math.ceil(round.cards.length / columns);
  boardStageEl.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  boardStageEl.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  for (const card of round.cards) {
    const button = buildCardButton(card);
    button.addEventListener("click", () => {
      button.classList.add("is-revealed");
      void handleGuess(card.id, button);
    });
    boardStageEl.appendChild(button);
  }
}

function renderMemoryBoard(round: MemoryRoundPayload): void {
  boardStageEl.classList.add("board-stage--grid", "board-stage--grid-9");
  boardStageEl.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  boardStageEl.style.gridTemplateRows = "repeat(3, minmax(0, 1fr))";
  resultStripEl.textContent = "Memorize the board.";
  showBoardFact();

  for (let index = 0; index < round.cards.length; index += 1) {
    const card = round.cards[index]!;
    const button = buildCardButton(card);
    button.dataset.position = String(index);
    button.addEventListener("click", () => {
      if (memoryLocked) return;
      button.classList.add("is-revealed");
      void handleGuess(card.id, button);
    });
    boardStageEl.appendChild(button);
  }

  memoryRevealHandle = window.setTimeout(() => {
    memoryLocked = false;
    resultStripEl.textContent = round.prompt;
    showBoardFact();
    boardOverlayEl.hidden = false;
    boardOverlayEl.textContent = "Tap the place where you saw it.";
    Array.from(boardStageEl.querySelectorAll<HTMLButtonElement>(".pill-card")).forEach((button) => {
      button.classList.add("pill-card--memory");
      const meta = button.querySelector(".pill-card-meta");
      if (meta) meta.remove();
    });
    setAnsweringState(true);
  }, 5000);
  memoryLocked = true;
}

function renderHigherLowerBoard(round: HigherLowerRoundPayload): void {
  boardStageEl.classList.add("board-stage--duel");
  boardStageEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  boardStageEl.style.gridTemplateRows = "minmax(0, 1fr)";
  const leftButton = buildCardButton(round.cards[0]!, "Left");
  const rightButton = buildCardButton(round.cards[1]!, "Right");
  leftButton.addEventListener("click", () => {
    leftButton.classList.add("is-revealed");
    void handleGuess("left", leftButton);
  });
  rightButton.addEventListener("click", () => {
    rightButton.classList.add("is-revealed");
    void handleGuess("right", rightButton);
  });
  boardStageEl.append(leftButton, rightButton);
}

function renderBrokenBoard(round: BrokenChallengeRoundPayload): void {
  boardStageEl.classList.add("board-stage--focus");
  const card = buildCardButton({ id: round.sample.id, sample: round.sample });
  card.classList.add("pill-card--broken");
  card.style.setProperty("--broken-reveal", `${round.revealSteps[0] ?? 42}%`);
  boardStageEl.appendChild(card);
}

function updateBrokenReveal(round: BrokenChallengeRoundPayload): void {
  const card = boardStageEl.querySelector<HTMLButtonElement>(".pill-card--broken");
  const nextStep = round.revealSteps[Math.min(brokenRevealIndex, round.revealSteps.length - 1)] ?? 100;
  if (card) {
    card.style.setProperty("--broken-reveal", `${nextStep}%`);
  }
}

function renderBrokenAnswers(round: BrokenChallengeRoundPayload): void {
  answersEl.classList.add("answers--options", "answers--options-broken");
  answersEl.hidden = false;
  for (const option of round.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-chip";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      void handleGuess(option.label, button);
    });
    answersEl.appendChild(button);
  }
}

function renderMatchBoard(round: MatchPairsRoundPayload): void {
  boardStageEl.classList.add("board-stage--pairs");
  showBoardFact();

  const labelsColumn = document.createElement("div");
  labelsColumn.className = "match-labels";

  const cardsColumn = document.createElement("div");
  cardsColumn.className = "match-cards";
  if (usePortraitMatchLayout()) {
    boardStageEl.classList.add("board-stage--pairs-portrait");
    cardsColumn.classList.add("match-cards--single");
  }

  const syncMatchSelectionUi = (): void => {
    Array.from(labelsColumn.querySelectorAll<HTMLButtonElement>(".answer-chip")).forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.label === matchSelectionLabel);
    });
    Array.from(cardsColumn.querySelectorAll<HTMLButtonElement>(".pill-card")).forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.cardId === matchSelectionSampleId);
    });
  };

  const clearMatchSelection = (): void => {
    matchSelectionLabel = null;
    matchSelectionSampleId = null;
    syncMatchSelectionUi();
  };

  for (const pair of round.pairs) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "answer-chip";
    chip.dataset.label = pair.label;
    chip.textContent = pair.label;
    chip.addEventListener("click", () => {
      if (matchedLabels.has(pair.label)) return;
      if (matchSelectionSampleId) {
        const expectedLabel = round.pairs.find((entry) => entry.sampleId === matchSelectionSampleId)?.label;
        if (expectedLabel === pair.label) {
          matchedLabels.add(pair.label);
          matchedSampleIds.add(matchSelectionSampleId);
          chip.classList.add("is-correct");
          const matchedCard = cardsColumn.querySelector<HTMLButtonElement>(`.pill-card[data-card-id="${CSS.escape(matchSelectionSampleId)}"]`);
          matchedCard?.classList.add("is-correct", "is-revealed");
          clearMatchSelection();
          showBoardFact();
          if (matchedLabels.size === round.pairs.length) {
            void handleCorrectRound();
          }
          return;
        }

        chip.classList.add("is-wrong");
        void handleIncorrect(pair.label, chip);
        return;
      }

      matchSelectionLabel = pair.label;
      showBoardFact();
      syncMatchSelectionUi();
    });
    labelsColumn.appendChild(chip);
  }

  for (const card of round.cards) {
    const button = buildCardButton(card);
    button.addEventListener("click", () => {
      if (matchedSampleIds.has(card.id)) return;
      button.classList.add("is-revealed");

      if (matchSelectionLabel) {
        const expected = round.pairs.find((pair) => pair.label === matchSelectionLabel)?.sampleId;
        if (expected === card.id) {
          matchedLabels.add(matchSelectionLabel);
          matchedSampleIds.add(card.id);
          button.classList.add("is-correct");
          const chip = labelsColumn.querySelector<HTMLButtonElement>(`.answer-chip[data-label="${CSS.escape(matchSelectionLabel)}"]`);
          chip?.classList.add("is-correct");
          clearMatchSelection();
          showBoardFact();

          if (matchedLabels.size === round.pairs.length) {
            void handleCorrectRound();
          }
          return;
        }

        button.classList.add("is-wrong");
        void handleIncorrect(matchSelectionLabel, button);
        return;
      }

      matchSelectionSampleId = card.id;
      showBoardFact();
      syncMatchSelectionUi();
    });
    cardsColumn.appendChild(button);
  }

  boardStageEl.append(labelsColumn, cardsColumn);
}

function renderRound(round: RoundPayload): void {
  currentRound = round;
  roundCount += 1;
  clearBoardState();
  reportErrorEl.disabled = false;
  reportErrorEl.textContent = "Report error";
  syncScoreUi();
  resultStripEl.textContent = round.prompt;
  showBoardFact();

  if (round.kind === "find_correct" || round.kind === "speed_round") {
    renderFindBoard(round);
  } else if (round.kind === "memory") {
    renderMemoryBoard(round);
  } else if (round.kind === "higher_lower") {
    renderHigherLowerBoard(round);
  } else if (round.kind === "match_pairs") {
    renderMatchBoard(round);
  } else if (round.kind === "broken_challenge") {
    renderBrokenBoard(round);
    renderBrokenAnswers(round);
  }

  setupSpeedTimer();
  if (round.kind !== "memory") {
    setAnsweringState(true);
  }
  requestAnimationFrame(fitBoardToViewport);
}

async function startGame(mode: GameMode): Promise<void> {
  resetForMode(mode);
  screenOnly("game");
  const firstRequestMode = getRequestedRoundMode();
  if (prefetchedRound && prefetchedRoundMode === firstRequestMode) {
    renderRound(prefetchedRound);
    prefetchedRound = null;
    prefetchedRoundMode = null;
  } else {
    await fetchRound(firstRequestMode);
  }
  getRequestedRoundMode(true);
  void prefetchRound(getRequestedRoundMode());
}

async function requestNextRound(): Promise<void> {
  const nextRequestMode = getRequestedRoundMode();
  const roundToRender = prefetchedRound && prefetchedRoundMode === nextRequestMode ? prefetchedRound : null;
  prefetchedRound = null;
  prefetchedRoundMode = null;
  resultStripEl.textContent = "Loading round...";
  currentRound = null;
  clearBoardState();
  if (roundToRender) {
    renderRound(roundToRender);
  } else {
    await fetchRound(nextRequestMode);
  }
  getRequestedRoundMode(true);
  void prefetchRound(getRequestedRoundMode());
}

async function handleCorrectRound(): Promise<void> {
  setAnsweringState(false);
  if (currentRound?.kind === "memory") {
    const selectedButton = boardStageEl.querySelector<HTMLButtonElement>(`.pill-card[data-card-id="${CSS.escape(currentRound.answer)}"]`);
    selectedButton?.classList.remove("pill-card--memory");
    selectedButton?.classList.add("is-revealed");
    grantFullMultiplier();
  } else if (currentRound?.kind === "broken_challenge") {
    boardStageEl.querySelector<HTMLButtonElement>(".pill-card--broken")?.classList.add("is-revealed");
    applyMeterDelta(METER_STEP);
  } else {
    applyMeterDelta(METER_STEP);
  }
  score += getScoreMultiplier();
  resultStripEl.textContent = "Correct.";
  if (currentRound?.kind === "speed_round") {
    timeLeft = Math.min(timeLimit || 30, timeLeft + 1.5);
  }
  window.setTimeout(() => {
    void requestNextRound();
  }, 2000);
}

async function handleIncorrect(chosenAnswer: string, button?: HTMLButtonElement): Promise<void> {
  if (!currentRound) return;
  setAnsweringState(false);
  if (currentRound.kind === "memory") {
    button?.classList.remove("pill-card--memory");
  }
  button?.classList.add("is-wrong");

  if (currentRound.kind === "broken_challenge" && brokenRevealIndex < currentRound.revealSteps.length - 1) {
    brokenRevealIndex += 1;
    updateBrokenReveal(currentRound);
    applyMeterDelta(-METER_STEP);
    resultStripEl.textContent = "Not yet. More of the image is revealed.";
    setAnsweringState(true);
    return;
  }

  if (currentRound.kind === "memory") {
    removeBonusProgress();
    highlightCorrectAnswer(currentRound);
    resultStripEl.textContent = `Wrong. Correct answer: ${getCorrectAnswerLabel(currentRound)}.`;

    try {
      await apiJson<GuessResponse>("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: chosenAnswer,
          expected: currentRound.answer,
          questionKey: currentRound.questionKey,
          mode: selectedGameMode,
          continueGame: true,
        }),
      });
    } catch {
      // Keep gameplay moving even if analytics logging fails.
    }

    window.setTimeout(() => {
      void requestNextRound();
    }, 3000);
    return;
  }

  if (currentRound.kind === "higher_lower") {
    applyMeterDelta(-METER_STEP);
    highlightCorrectAnswer(currentRound);
    resultStripEl.textContent = `Wrong. Correct answer: ${getCorrectAnswerLabel(currentRound)}.`;

    try {
      await apiJson<GuessResponse>("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: chosenAnswer,
          expected: currentRound.answer,
          questionKey: currentRound.questionKey,
          mode: selectedGameMode,
          continueGame: true,
        }),
      });
    } catch {
      // Keep gameplay moving even if analytics logging fails.
    }

    window.setTimeout(() => {
      void requestNextRound();
    }, 3000);
    return;
  }

  pendingGameOver = true;
  applyMeterDelta(-METER_STEP);
  if (currentRound.kind === "broken_challenge") {
    boardStageEl.querySelector<HTMLButtonElement>(".pill-card--broken")?.classList.add("is-revealed");
  }
  highlightCorrectAnswer(currentRound);
  resultStripEl.textContent = `Wrong. Correct answer: ${getCorrectAnswerLabel(currentRound)}.`;

  try {
    await apiJson<GuessResponse>("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: chosenAnswer,
        expected: currentRound.answer,
        questionKey: currentRound.questionKey,
        mode: selectedGameMode,
        continueGame: false,
      }),
    });
  } catch {
    // Keep gameplay moving even if analytics logging fails.
  }

  window.setTimeout(() => {
    void openNameDialog();
  }, 3000);
}

async function handleGuess(choice: string, button?: HTMLButtonElement): Promise<void> {
  if (!currentRound || isSubmitting || pendingGameOver) return;
  isSubmitting = true;

  try {
    if (choice === currentRound.answer) {
      button?.classList.add("is-correct");
      await handleCorrectRound();
    } else {
      await handleIncorrect(choice, button);
    }
  } finally {
    window.setTimeout(() => {
      isSubmitting = false;
    }, 120);
  }
}

async function showFinishScreen(title: string, copy: string): Promise<void> {
  stopTimer();
  const leaderboard = await fetchLeaderboard();
  finishTitleEl.textContent = title;
  finishScoreEl.textContent = String(score);
  finishCopyEl.textContent = copy;
  renderLeaderboard(finishLeaderboardListEl, leaderboard);
  screenOnly("finish");
}

async function openNameDialog(): Promise<void> {
  stopTimer();
  if (score <= 0) {
    await showFinishScreen("Game Over", "No score saved this time.");
    return;
  }
  playerNameEl.value = localStorage.getItem("pill-id:last-name") || "";
  nameDialogBackdropEl.classList.add("is-open");
  playerNameEl.focus();
}

async function saveScore(name: string): Promise<void> {
  const payload = await apiJson<SubmitScoreResponse>("/api/submit-score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      score,
      mode: selectedGameMode,
    }),
  });
  localStorage.setItem("pill-id:last-name", name);
  lastSubmittedName = name;
  lastSubmittedScore = payload.bestScore;
  nameDialogBackdropEl.classList.remove("is-open");
  await showFinishScreen(
    payload.accepted ? "New High Score!" : "Score Saved",
    payload.accepted ? "You climbed the leaderboard." : "Your best result is already higher.",
  );
}

playButtonEl.addEventListener("click", () => {
  void startGame(selectedGameMode);
});

modeOptionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedGameMode = button.dataset.selectMode as GameMode;
    mixedSequenceIndex = 0;
    prefetchedRound = null;
    prefetchedRoundMode = null;
    syncSelectedModeUi();
    void fetchLeaderboard()
      .then((leaderboard) => {
        renderLeaderboard(leaderboardListEl, leaderboard);
      })
      .catch(() => undefined);
    void prefetchRound(getRequestedRoundMode());
  });
});

scopeToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const scope = button.dataset.scope;
    if (scope !== "today" && scope !== "all") return;
    selectedLeaderboardScope = scope;
    syncLeaderboardScopeUi();
    void fetchLeaderboard()
      .then((leaderboard) => {
        renderLeaderboard(leaderboardListEl, leaderboard);
        renderLeaderboard(finishLeaderboardListEl, leaderboard);
      })
      .catch(() => undefined);
  });
});

playAgainEl.addEventListener("click", () => {
  screenOnly("start");
});

menuButtonEl.addEventListener("click", () => {
  stopTimer();
  screenOnly("start");
});

reportErrorEl.addEventListener("click", async () => {
  if (!currentRound) return;
  reportErrorEl.disabled = true;
  try {
    const sampleId =
      currentRound.kind === "higher_lower"
        ? `${currentRound.cards[0].sample.id}|${currentRound.cards[1].sample.id}`
        : currentRound.kind === "match_pairs"
          ? currentRound.cards.map((card) => card.sample.id).join("|")
          : currentRound.kind === "broken_challenge"
            ? currentRound.sample.id
            : currentRound.cards.map((card) => card.sample.id).join("|");

    await apiJson<ReportErrorResponse>("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionKey: currentRound.questionKey,
        sampleId,
      }),
    });
    reportErrorEl.textContent = "Reported";
  } catch {
    reportErrorEl.disabled = false;
    reportErrorEl.textContent = "Try again";
  }
});

skipSaveEl.addEventListener("click", () => {
  nameDialogBackdropEl.classList.remove("is-open");
  void showFinishScreen("Game Over", "Score not saved.");
});

nameFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = playerNameEl.value.trim();
  if (!name) return;
  void saveScore(name);
});

window.addEventListener("resize", () => {
  syncViewportState();
  fitBoardToViewport();
});

syncViewportState();
syncSelectedModeUi();
syncLeaderboardScopeUi();
syncScoreUi();
timerCardEl.style.display = "none";
updateMeterUi();
void fetchBootstrap().then(() => prefetchRound(getRequestedRoundMode()));
