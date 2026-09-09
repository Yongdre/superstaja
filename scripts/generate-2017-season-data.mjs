// Preview only: prints JSON to stdout and never overwrites a user's edited file.
// Run from any directory with Node 24: node scripts/generate-2017-season-data.mjs
import { readFileSync } from "node:fs";
import { calculatePitcherGrade } from "../src/engine/pitcherGrade.ts";

const records = JSON.parse(readFileSync(new URL("../docs/sources/2017-kbo-records.json", import.meta.url), "utf8"));
const base = JSON.parse(readFileSync(new URL("../src/data/seasons/kbo-league-data-2017.json", import.meta.url), "utf8"));
const clampRound = (n, min, max) => Math.max(min, Math.min(max, Math.round(n)));
const leagueInnings = records.league.inningsOuts / 3;
const leagueEra = records.league.earnedRuns * 9 / leagueInnings;
const leagueK9 = records.league.strikeouts * 9 / leagueInnings;
const leagueBb9 = records.league.walks * 9 / leagueInnings;
const leagueHr9 = records.league.homeRuns * 9 / leagueInnings;

function speedGrade(stats) {
  // Volume proxy, not a measured sprint-speed or an exact steal projection.
  const attempts = (stats.stolenBases + stats.caughtStealing) * Math.min(2, 144 / stats.games);
  for (const [minimum, grade] of [[48, 10], [35, 9], [25, 8], [14, 7], [9, 6], [5, 5], [2, 4], [1, 3]]) {
    if (attempts >= minimum) return grade;
  }
  return 2;
}

function pitcherRatings(player) {
  const stats = player.stats;
  const ip = stats.inningsOuts / 3;
  // Conservative statistical proxies anchored at the current engine's neutral 72.
  // Prior innings reduce short-sample extremes. They are NOT additional real stats.
  const reliability = ip / (ip + (player.role === "SP" ? 30 : 15));
  const qualityDelta = (leagueEra - stats.era) * 7;
  const ratings = {
    stuff: clampRound(72 + reliability * (qualityDelta + (stats.strikeouts * 9 / ip - leagueK9) * 4.5), 30, 97),
    movement: clampRound(72 + reliability * (qualityDelta + (leagueHr9 - stats.homeRuns * 9 / ip) * 7), 30, 97),
    control: clampRound(72 + reliability * ((leagueBb9 - stats.walks * 9 / ip) * 8 + qualityDelta * 0.2), 30, 97),
    stamina: player.role === "SP"
      ? clampRound(38 + ip * 0.28, 60, 96)
      : player.role === "CP"
        ? clampRound(30 + ip / 5, 35, 45)
        : clampRound(35 + ip / 5, 38, 55),
  };
  return { ...ratings, grade: calculatePitcherGrade(ratings) };
}

const dataset = {
  schemaVersion: 1,
  label: "2017 KBO 실제 기록 기반 · 주전 144경기판",
  sourceSeason: 2017,
  teams: {},
};
for (const [teamId, team] of Object.entries(records.teams)) {
  const { hitters: _hitters, pitchers: _pitchers, ...metadata } = base.teams[teamId];
  dataset.teams[teamId] = {
    ...metadata,
    hitters: team.hitters.map((player, index) => ({
      id: `${teamId}-2017-H${String(index + 1).padStart(2, "0")}`,
      name: player.name,
      position: player.position,
      // Current game accepts L/R only. Rojas is a switch hitter, represented as L.
      bats: player.bats === "S" ? "L" : player.bats,
      availability: "REGULAR",
      statProfile: {
        games: 144,
        avg: player.stats.avg,
        homeRuns: Math.round(player.stats.homeRuns * Math.min(2, 144 / player.stats.games)),
        eye: clampRound((player.stats.walks / player.stats.plateAppearances - 0.048) / 0.008, 1, 10),
        speed: speedGrade(player.stats),
      },
    })),
    pitchers: team.pitchers.map((player, index) => ({
      id: `${teamId}-2017-P${String(index + 1).padStart(2, "0")}`,
      name: player.name,
      throws: player.throws,
      role: player.role,
      ...pitcherRatings(player),
    })),
  };
}
console.log(JSON.stringify(dataset, null, 2));
