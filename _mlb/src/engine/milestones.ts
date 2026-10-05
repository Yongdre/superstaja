import { avg } from "./statistics";
import type { BatterStats, GameState, GameSummary, SeasonState, TeamId } from "./types";

export function forcedNoHitRemaining(state: SeasonState): number {
  const game = state.game;
  if (!game || game.competition !== "REGULAR_SEASON" || game.finalized) return 0;
  const restriction = state.battingRestriction;
  if (restriction?.remaining) return restriction.remaining;
  if (restriction?.cooldownFixtureId === game.fixture.id) return 0;
  const games = state.teamRecords[state.config.userTeam].games + 1;
  const stats = state.playerStats["USER-PLAYER"];
  // Compare without display rounding; tolerate floating-point addition at the boundary.
  return games > 100 && stats.ab > 0 && avg(stats) + 1e-12 >= state.config.targetAvgMax + 0.080 ? 10 : 0;
}

export function syncBattingRestriction(state: SeasonState): void {
  const remaining = forcedNoHitRemaining(state);
  if (remaining > 0 && !state.battingRestriction?.remaining) state.battingRestriction = { remaining };
}

export function recordUserGame(state: SeasonState, game: GameState): void {
  if (game.fixture.away !== state.config.userTeam && game.fixture.home !== state.config.userTeam) return;
  if (!game.lineups[state.config.userTeam]?.includes("USER-PLAYER")) return;
  const history = state.userGameHistory ??= [];
  if (history.some(record => record.fixtureId === game.fixture.id && record.competition === game.competition)) return;
  history.push({ fixtureId: game.fixture.id, competition: game.competition, stats: structuredClone(game.userGameStats) });
}

export function userGameStreaks(state: SeasonState): { hits: number; onBase: number; homeRuns: number } {
  const game = state.game;
  if (!game) return { hits: 0, onBase: 0, homeRuns: 0 };
  // Regular season and postseason have independent streaks. Postseason series continue across rounds.
  const postseason = game.competition !== "REGULAR_SEASON";
  const history = (state.userGameHistory ?? []).filter(record => (record.competition !== "REGULAR_SEASON") === postseason);
  const currentIncluded = history.some(record => record.fixtureId === game.fixture.id && record.competition === game.competition);
  const currentUserGame = (game.fixture.away === state.config.userTeam || game.fixture.home === state.config.userTeam) && game.lineups[state.config.userTeam]?.includes("USER-PLAYER");
  const count = (qualifies: (stats: BatterStats) => boolean) => {
    let total = 0;
    if (currentUserGame && !currentIncluded) {
      if (qualifies(game.userGameStats)) total = 1;
      else if (game.finalized) return 0;
      // An ongoing game without a hit yet does not end yesterday's streak.
    }
    for (let index = history.length - 1; index >= 0; index--) {
      if (!qualifies(history[index].stats)) break;
      total++;
    }
    return total;
  };
  return { hits: count(stats => stats.h > 0), onBase: count(stats => stats.h + stats.bb + stats.hbp > 0), homeRuns: count(stats => stats.hr > 0) };
}

export function hasCycle(stats: BatterStats): boolean {
  return stats.h - stats.doubles - stats.triples - stats.hr > 0 && stats.doubles > 0 && stats.triples > 0 && stats.hr > 0;
}

export const formatTeamStreak = (streak?: number): string =>
  streak ? `${Math.abs(streak)}연${streak > 0 ? "승" : "패"}` : "–";

/** 이전 세이브에 전체 경기 결과가 있는 팀만 연속 승패를 정확하게 복원합니다. */
export function restoreTeamStreaks(state: SeasonState): void {
  for (const team of Object.keys(state.teamRecords) as TeamId[]) {
    const record = state.teamRecords[team];
    if (record.streak !== undefined) continue;
    const results = (state.regularResults ?? []).filter(result => result.summary.away === team || result.summary.home === team);
    if (!results.length || results.length !== record.games) continue;
    let streak = 0;
    for (const result of results) {
      const outcome = teamResult(result.summary, team);
      streak = outcome === "무" ? 0 : outcome === "승" ? Math.max(0, streak) + 1 : Math.min(0, streak) - 1;
    }
    record.streak = streak;
  }
}

export function teamResult(summary: GameSummary, team: TeamId): string {
  if (summary.awayScore === summary.homeScore) return "무";
  const winner = summary.awayScore > summary.homeScore ? summary.away : summary.home;
  return winner === team ? "승" : "패";
}

export function scoreForTeam(summary: GameSummary, team: TeamId): string {
  return summary.away === team ? `${summary.awayScore}–${summary.homeScore}` : `${summary.homeScore}–${summary.awayScore}`;
}
