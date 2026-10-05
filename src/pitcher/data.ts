import { estimateHitterRatings, estimatePitcherRatings } from "../engine/playerProfiles";
import mlbTeams from "../../_mlb/src/data/mlbTeams.json";
import type { PitcherProfile } from "../engine/types";
import type { League, PitcherDataset, PitcherHitter, PitcherTeam } from "./types";

interface RawDataset {
  label: string;
  sourceSeason: number;
  teams: Record<string, PitcherTeam>;
}

function normalize(raw: RawDataset, id: string, league: League): PitcherDataset {
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

const kboFiles = import.meta.glob<{ default: RawDataset }>("../data/seasons/*.json", { eager: true });
const mlbFiles = import.meta.glob<{ default: RawDataset }>("../../_mlb/src/data/seasons/*.json", { eager: true });
export const datasetIssues: string[] = [];
export const pitcherDatasets: PitcherDataset[] = [];
for (const [league, files] of [["KBO", kboFiles], ["MLB", mlbFiles]] as const) {
  for (const [path, module] of Object.entries(files)) {
    try {
      const year = Number(path.split("/").pop()?.match(/^(\d{4})/)?.[1]);
      const raw = { ...module.default, sourceSeason: year || module.default.sourceSeason };
      const count = league === "KBO" ? 10 : 30;
      if (Object.keys(raw.teams).length !== count || Object.values(raw.teams).some((team) => team.hitters.length < 9 || !team.pitchers.some((pitcher) => pitcher.role === "SP"))) {
        throw new Error(`${league} ${count}개 구단의 타자·선발투수 데이터가 필요합니다.`);
      }
      pitcherDatasets.push(normalize(raw, `${league}:${path.split("/").pop()}`, league));
    } catch (error) {
      datasetIssues.push(`${path}: ${error instanceof Error ? error.message : "데이터 오류"}`);
    }
  }
}
pitcherDatasets.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));

export const datasetsFor = (league: League) => pitcherDatasets.filter((dataset) => dataset.league === league);
export const defaultPitcherDataset = (league: League): PitcherDataset => {
  const dataset = datasetsFor(league)[0];
  if (!dataset) throw new Error(`${league} 시즌 데이터가 없습니다.`);
  return dataset;
};
