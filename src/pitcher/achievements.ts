import type { PitchChoice, PitchGame, PitchLog, PitcherState } from "./types";

export const PITCH_PLAY_DISPLAY_MS = 1000;
export const PITCH_ACHIEVEMENT_DISPLAY_MS = 2000;
export interface PitchCelebration { label: string; text: string; durationMs: number }

export function qualityStartConditions(game: PitchGame) {
  // Best Pitcher uses the user's requested total-runs definition, including unearned runs.
  return { qs: game.stats.outs >= 18 && game.stats.runs <= 3, qsPlus: game.stats.outs >= 21 && game.stats.runs <= 3 };
}

export function gameAchievementLabels(game: PitchGame): string[] {
  const quality = qualityStartConditions(game);
  const labels: string[] = [];
  if (game.phase === "FINISHED") {
    if (game.stats.perfectGames) labels.push("퍼펙트게임");
    if (game.stats.noHitters && game.stats.runs === 0) labels.push("노히트노런");
    if (game.stats.shutouts && game.decision === "W") labels.push("완봉승");
  }
  if (quality.qs) labels.push("QS");
  if (quality.qsPlus) labels.push("QS+");
  return labels;
}

export function pitcherCelebrationsForTransition(before: PitcherState, after: PitcherState): PitchCelebration[] {
  const previous = before.game;
  const game = after.game;
  if (!previous || !game || before.year !== after.year || previous.fixture.id !== game.fixture.id) return [];
  const notices: PitchCelebration[] = [];
  for (const entry of game.log) {
    if (entry.id < previous.nextLogId || entry.kind !== "choice" || !entry.runsScored) continue;
    notices.push({ label: entry.outcome === "HR" ? "HOME RUN ALLOWED" : "RUNS ALLOWED", text: `${entry.runsScored}점 ${entry.outcome === "HR" ? "홈런 허용" : "실점"}!`, durationMs: PITCH_PLAY_DISPLAY_MS });
  }
  const priorQuality = qualityStartConditions(previous);
  const currentQuality = qualityStartConditions(game);
  if (!priorQuality.qs && currentQuality.qs) notices.push({ label: "QUALITY START", text: "QS 달성! · 6이닝 이상 3실점 이하", durationMs: PITCH_ACHIEVEMENT_DISPLAY_MS });
  if (!priorQuality.qsPlus && currentQuality.qsPlus) notices.push({ label: "QUALITY START PLUS", text: "QS+ 달성! · 7이닝 이상 3실점 이하", durationMs: PITCH_ACHIEVEMENT_DISPLAY_MS });
  if (previous.phase !== "FINISHED" && game.phase === "FINISHED") {
    if (game.stats.perfectGames) notices.push({ label: "PERFECT GAME", text: "퍼펙트게임 달성!", durationMs: PITCH_ACHIEVEMENT_DISPLAY_MS });
    if (game.stats.noHitters && game.stats.runs === 0) notices.push({ label: "NO-HITTER", text: "노히트노런 달성!", durationMs: PITCH_ACHIEVEMENT_DISPLAY_MS });
    if (game.stats.shutouts && game.decision === "W") notices.push({ label: "SHUTOUT WIN", text: "완봉승 달성!", durationMs: PITCH_ACHIEVEMENT_DISPLAY_MS });
  }
  return notices;
}

export function restorePitchingStreaks(entries: PitchLog[]): PitchGame["streaks"] {
  const streaks = { strikeouts: 0, outBatters: 0 };
  for (const entry of entries) {
    if (entry.kind !== "choice") continue;
    const outcome: PitchChoice | undefined = entry.outcome ?? (/도루실패|견제사/.test(entry.text) ? "CS" : /도루/.test(entry.text) ? "SB" : /폭투/.test(entry.text) ? "WP" : /삼진/.test(entry.text) ? "K" : /NO HIT|병살타|땅볼|뜬공|직선타/.test(entry.text) ? "OUT" : /희생번트/.test(entry.text) ? "SH" : undefined);
    if (outcome === "SB" || outcome === "WP" || outcome === "CS") continue;
    streaks.strikeouts = outcome === "K" ? streaks.strikeouts + 1 : 0;
    streaks.outBatters = outcome === "K" || outcome === "OUT" || outcome === "SH" ? streaks.outBatters + 1 : 0;
  }
  return streaks;
}
