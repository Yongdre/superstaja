import { sumBatterStats } from "./statistics";
import type { BatterStats, CareerSeasonSummary, SeasonState } from "./types";

export function careerSeasonsIncludingCurrent(state: SeasonState): CareerSeasonSummary[] {
  const completed = state.career.seasons;
  if (completed.some((season) => season.season === state.season)) return completed;
  return [
    ...completed,
    {
      season: state.season,
      teamId: state.config.userTeam,
      playerStats: state.playerStats["USER-PLAYER"],
      teamRecord: state.teamRecords[state.config.userTeam],
      goals: {
        battingOrder: state.config.battingOrder,
        targetAvgMin: state.config.targetAvgMin,
        targetAvgMax: state.config.targetAvgMax,
        homeRunCap: state.config.homeRunCap,
        enforceHomeRunCap: state.config.enforceHomeRunCap,
        isFinalSeason: state.config.isFinalSeason,
      },
    },
  ];
}

export function careerStats(state: SeasonState): BatterStats {
  return sumBatterStats(careerSeasonsIncludingCurrent(state).map((season) => season.playerStats));
}

export function careerTeamGames(state: SeasonState): number {
  return careerSeasonsIncludingCurrent(state).reduce((games, season) => games + season.teamRecord.games, 0);
}
