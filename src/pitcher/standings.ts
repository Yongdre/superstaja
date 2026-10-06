import type { PitchResult } from "./types";

/** Use every completed team game, including games between the user's starts. */
export function pitcherTeamStreaks(results: PitchResult[]): Record<string, number> {
  const streaks: Record<string, number> = {};
  for (const result of results) {
    for (const [team, own, other] of [[result.fixture.home, result.homeScore, result.awayScore], [result.fixture.away, result.awayScore, result.homeScore]] as const) {
      const previous = streaks[team] ?? 0;
      streaks[team] = own === other ? 0 : own > other ? Math.max(0, previous) + 1 : Math.min(0, previous) - 1;
    }
  }
  return streaks;
}
