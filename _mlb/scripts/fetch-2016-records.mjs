// Official MLB Stats API, read-only. Prints JSON; never overwrites local data.
import { readFileSync } from "node:fs";
const teams = JSON.parse(readFileSync(new URL("../src/data/mlbTeams.json", import.meta.url), "utf8"));
const requested = process.argv.slice(2);
const selected = requested.length ? teams.filter(team => requested.includes(team.id)) : teams;
const keys = {
  hitting: ["gamesPlayed","plateAppearances","atBats","hits","doubles","triples","homeRuns","baseOnBalls","hitByPitch","strikeOuts","stolenBases","caughtStealing","sacFlies","sacBunts","runs","rbi"],
  pitching: ["gamesPlayed","gamesStarted","outs","earnedRuns","hits","homeRuns","baseOnBalls","strikeOuts","saves","holds","battersFaced"],
  fielding: ["gamesPlayed","gamesStarted"],
};
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}
const result = [];
for (const team of selected) {
  const record = {team, sources: {}};
  for (const group of Object.keys(keys)) {
    const url = `https://statsapi.mlb.com/api/v1/stats?stats=season&group=${group}&season=2016&teamId=${team.mlbId}&sportIds=1&playerPool=ALL&limit=1000`;
    const data = (await get(url)).stats?.[0];
    if (!data || data.splits.length !== data.totalSplits) throw new Error(`Missing or paginated ${team.id} ${group}`);
    if (data.splits.some(split => split.team.id !== team.mlbId || split.season !== "2016")) throw new Error("Unexpected team/season split");
    record.sources[group] = url;
    record[group] = data.splits.map(split => ({id:split.player.id,name:split.player.fullName,position:split.position?.abbreviation,
      ...Object.fromEntries(keys[group].map(key => [key,split.stat[key] ?? 0]))}));
  }
  const info = (await get(`https://statsapi.mlb.com/api/v1/teams/${team.mlbId}?season=2016`)).teams[0];
  record.team = {...team,name:info.name,city:info.locationName};
  result.push(record);
}
console.log(JSON.stringify(result));
