import { era, kPerNine, pitcherKey, USER_PITCHER_ID } from "./engine";
import type { PitcherState, PitchingStats } from "./types";

export type PitcherRankingCategory = "era" | "wins" | "strikeouts" | "kPerNine" | "qualityStarts" | "qualityStartsPlus";
export const pitcherRankingCategories: { value: PitcherRankingCategory; label: string }[] = [
  { value: "era", label: "방어율" }, { value: "wins", label: "승리" }, { value: "strikeouts", label: "삼진" },
  { value: "kPerNine", label: "K/9" }, { value: "qualityStarts", label: "QS" }, { value: "qualityStartsPlus", label: "QS+" },
];
export interface PitcherRankingRow {
  key: string; name: string; teamId: string; user: boolean; stats: PitchingStats;
  qualified: boolean; requiredInnings: number; rank: number | null;
}

export function pitcherRankings(state: PitcherState, category: PitcherRankingCategory = "era", qualifiedOnly = true): PitcherRankingRow[] {
  const rows: PitcherRankingRow[] = [];
  for (const team of Object.values(state.dataset.teams)) {
    const requiredInnings = Math.max(1, state.records[team.id].games - state.leaguePitchingSinceGames[team.id]);
    for (const player of [...team.pitchers.filter((pitcher) => pitcher.role === "SP"), ...(team.id === state.config.teamId ? [{ id: USER_PITCHER_ID, name: state.config.playerName }] : [])]) {
      const key = pitcherKey(team.id, player.id);
      const stats = state.leaguePitching[key];
      if (!stats?.starts) continue;
      rows.push({ key, name: player.name, teamId: team.id, user: player.id === USER_PITCHER_ID, stats, qualified: stats.outs >= requiredInnings * 3, requiredInnings, rank: null });
    }
  }
  const rateCategory = category === "era" || category === "kPerNine";
  const value = (row: PitcherRankingRow): number | null => category === "era" ? era(row.stats) : category === "kPerNine" ? kPerNine(row.stats) : row.stats[category];
  const filtered = rows.filter((row) => !rateCategory || !qualifiedOnly || row.qualified);
  filtered.sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av === null || bv === null) return av === bv ? a.key.localeCompare(b.key) : av === null ? 1 : -1;
    return (category === "era" ? av - bv : bv - av) || a.key.localeCompare(b.key);
  });
  let previousValue: number | null = null;
  let rank = 0;
  filtered.forEach((row, index) => {
    const current = value(row);
    if (current === null) return;
    if (index === 0 || current !== previousValue) rank = index + 1;
    row.rank = rank;
    previousValue = current;
  });
  return filtered;
}
