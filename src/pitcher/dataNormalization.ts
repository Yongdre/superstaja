import { estimateHitterRatings, estimatePitcherRatings } from "../engine/playerProfiles";
import mlbTeams from "../../_mlb/src/data/mlbTeams.json";
import type { PitcherProfile } from "../engine/types";
import type { League, PitcherDataset, PitcherHitter, PitcherTeam } from "./types";

export interface RawDataset {
  label: string;
  sourceSeason: number;
  teams: Record<string, PitcherTeam>;
}

export function normalizePitcherDataset(raw: RawDataset, id: string, league: League): PitcherDataset {
  const teams = Object.fromEntries(Object.entries(raw.teams).map(([inputId, team]) => {
    const teamId = league === "MLB" ? inputId === "OAK" ? "ATH" : inputId === "ARI" ? "AZ" : inputId : inputId;
    const structure = league === "MLB" ? mlbTeams.find((item) => item.id === teamId) : undefined;
    return [teamId, {
      ...team,
      id: teamId,
      league: structure?.league,
      division: structure?.division,
      hitters: team.hitters.map((hitter): PitcherHitter => ({
        ...hitter,
        ...(hitter.statProfile ? estimateHitterRatings(hitter.statProfile) : {}),
        ...hitter.ratingOverrides,
      })),
      pitchers: team.pitchers.map((pitcher): PitcherProfile => ({
        ...pitcher,
        movement: pitcher.movement ?? pitcher.stuff,
        ...(pitcher.statProfile ? estimatePitcherRatings(pitcher.statProfile, pitcher.role) : {}),
        ...pitcher.ratingOverrides,
      })),
    }];
  }));
  return { id, league, year: raw.sourceSeason, label: raw.label, teams };
}

