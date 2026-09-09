import type { TeamId, TeamRecord } from "./types";

export interface StandingRow {
  teamId: TeamId;
  record: TeamRecord;
  pct: number;
  gamesBack: number;
}

export const winningPct = (record: TeamRecord) => {
  const decisions = record.wins + record.losses;
  return decisions ? record.wins / decisions : 0;
};

export function calculateStandings(records: Record<TeamId, TeamRecord>): StandingRow[] {
  const rows = (Object.keys(records) as TeamId[])
    .map((teamId) => ({ teamId, record: records[teamId], pct: winningPct(records[teamId]), gamesBack: 0 }))
    .sort((a, b) => b.pct - a.pct || b.record.wins - a.record.wins || a.record.losses - b.record.losses);
  if (!rows.length) return rows;
  const leader = rows[0].record;
  rows.forEach((row) => {
    row.gamesBack = ((leader.wins - row.record.wins) + (row.record.losses - leader.losses)) / 2;
  });
  return rows;
}

export function recordGame(
  records: Record<TeamId, TeamRecord>,
  away: TeamId,
  home: TeamId,
  awayScore: number,
  homeScore: number,
): void {
  const a = records[away];
  const h = records[home];
  a.games += 1;
  h.games += 1;
  a.awayGames += 1;
  h.homeGames += 1;
  a.runsFor += awayScore;
  a.runsAgainst += homeScore;
  h.runsFor += homeScore;
  h.runsAgainst += awayScore;
  if (awayScore === homeScore) {
    a.ties += 1;
    h.ties += 1;
  } else if (awayScore > homeScore) {
    a.wins += 1;
    h.losses += 1;
  } else {
    h.wins += 1;
    a.losses += 1;
  }
}
