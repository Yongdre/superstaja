import { leagues, divisions, mlbTeams, teamStructure } from "../data/mlbStructure";
import { emptyBatterStats, sumBatterStats } from "./statistics";
import { winningPct } from "./standings";
import type { BatterStats, GameFixture, GameSummary, HeadToHeadRecord, MlbLeague, PostseasonBattingSummary, PostseasonSeries, PostseasonState, SeasonState, TeamId, TeamRecord } from "./types";

export const postseasonStageLabel = { REGULAR_SEASON: "정규시즌", WILD_CARD: "와일드카드 시리즈", DIVISION_SERIES: "디비전시리즈", CHAMPIONSHIP_SERIES: "리그 챔피언십시리즈", WORLD_SERIES: "월드시리즈" } as const;
const stages = ["WILD_CARD", "DIVISION_SERIES", "CHAMPIONSHIP_SERIES", "WORLD_SERIES"] as const;

export function rankMlbTeams(ids: TeamId[], records: Record<TeamId, TeamRecord>, h2h: Record<string, HeadToHeadRecord> = {}, history: SeasonState["regularResults"] = []): TeamId[] {
  const rate = (team: TeamId, opponents: TeamId[]) => {
    const games = opponents.map(opponent => h2h[`${team}:${opponent}`]).filter(Boolean);
    const wins = games.reduce((sum, record) => sum + record.wins, 0);
    const total = games.reduce((sum, record) => sum + record.wins + record.losses, 0);
    return total ? wins / total : 0;
  };
  const intraleagueHistory = (team: TeamId) => history.filter(({ summary }) =>
    (summary.away === team || summary.home === team) && teamStructure[summary.away].league === teamStructure[summary.home].league);
  const lateRate = (team: TeamId, extra: number, tied: TeamId[]) => {
    const games = intraleagueHistory(team);
    const late = games.filter(game => game.date.slice(5) > "07-14");
    const early = games.filter(game => game.date.slice(5) <= "07-14" && (tied.length === 2 || !tied.includes(game.summary.away === team ? game.summary.home : game.summary.away)));
    const selected = [...late, ...early.slice(Math.max(0, early.length - extra))];
    return selected.length ? selected.filter(({ summary }) => (summary.awayScore > summary.homeScore ? summary.away : summary.home) === team).length / selected.length : 0;
  };
  const breakTie = (tied: TeamId[], depth = 0): TeamId[] => {
    if (tied.length < 2) return tied;
    const opponents = (team: TeamId, division: boolean) => mlbTeams.filter(other => other.id !== team && other.league === teamStructure[team].league && (!division || other.division === teamStructure[team].division)).map(other => other.id);
    const criteria = [
      (team: TeamId) => Number(tied.every(other => other === team || rate(team, [other]) > 0.5)),
      (team: TeamId) => rate(team, tied.filter(other => other !== team)),
      (team: TeamId) => rate(team, opponents(team, true)),
      (team: TeamId) => rate(team, opponents(team, false)),
      ...Array.from({ length: 163 }, (_, extra) => (team: TeamId) => lateRate(team, extra, tied)),
    ];
    for (const criterion of criteria) {
      const groups = new Map<number, TeamId[]>();
      for (const team of tied) { const value = criterion(team); groups.set(value, [...(groups.get(value) ?? []), team]); }
      if (groups.size > 1) return [...groups].sort(([a], [b]) => b - a).flatMap(([, group]) => depth < 30 ? breakTie(group, depth + 1) : group.sort());
    }
    // 모든 기록까지 같거나 시즌 시작 전이면 안정적인 ID 순서로만 최종 구분합니다.
    return [...tied].sort();
  };
  const groups = new Map<number, TeamId[]>();
  for (const team of ids) { const pct = winningPct(records[team]); groups.set(pct, [...(groups.get(pct) ?? []), team]); }
  return [...groups].sort(([a], [b]) => b - a).flatMap(([, tied]) => breakTie(tied));
}

function makeSeries(id: string, league: PostseasonSeries["league"], stage: PostseasonSeries["stage"], higherSeed: TeamId, lowerSeed: TeamId, seeds: TeamId[]): PostseasonSeries {
  return { id, league, stage, higherSeed, lowerSeed, higherSeedNumber: seeds.indexOf(higherSeed) + 1, lowerSeedNumber: seeds.indexOf(lowerSeed) + 1,
    wins: { [higherSeed]: 0, [lowerSeed]: 0 }, ties: 0, neededWins: stage === "WILD_CARD" ? 2 : stage === "DIVISION_SERIES" ? 3 : 4, gamesPlayed: 0 };
}

export function createPostseason(records: Record<TeamId, TeamRecord>, playerStats: PostseasonState["playerStats"], h2h: Record<string, HeadToHeadRecord> = {}, history: SeasonState["regularResults"] = []): PostseasonState {
  const rank = (ids: TeamId[]) => rankMlbTeams(ids, records, h2h, history);
  const leagueSeeds = {} as Record<MlbLeague, TeamId[]>;
  const matches: PostseasonSeries[] = [];
  for (const league of leagues) {
    const teams = mlbTeams.filter(team => team.league === league);
    const winners = divisions.map(division => rank(teams.filter(team => team.division === division).map(team => team.id))[0]);
    const seeds = [...rank(winners), ...rank(teams.filter(team => !winners.includes(team.id)).map(team => team.id)).slice(0, 3)];
    leagueSeeds[league] = seeds;
    matches.push(makeSeries(`${league}-WC45`, league, "WILD_CARD", seeds[3], seeds[4], seeds), makeSeries(`${league}-WC36`, league, "WILD_CARD", seeds[2], seeds[5], seeds));
  }
  return { seeds: leagues.flatMap(league => leagueSeeds[league]), leagueSeeds, series: matches[0], pendingSeries: matches.slice(1), completedSeries: [], games: [], playerStats, regularRanking: rank(mlbTeams.map(team => team.id)) };
}

export function seriesWinner(series: PostseasonSeries): TeamId | undefined {
  return [series.higherSeed, series.lowerSeed].find(team => (series.wins[team] ?? 0) >= series.neededWins);
}
export const isSeriesClinched = (series: PostseasonSeries) => Boolean(seriesWinner(series));
export const seriesIncludes = (series: PostseasonSeries, team: TeamId) => series.higherSeed === team || series.lowerSeed === team;

export function recordPostseasonResult(postseason: PostseasonState, summary: GameSummary, userStats?: BatterStats) {
  if (summary.awayScore === summary.homeScore) throw new Error("MLB 포스트시즌은 무승부로 끝나지 않습니다.");
  const series = postseason.series;
  series.gamesPlayed++;
  const winner = summary.awayScore > summary.homeScore ? summary.away : summary.home;
  series.wins[winner] = (series.wins[winner] ?? 0) + 1;
  postseason.games.push({ seriesId: series.id, stage: series.stage, gameNumber: series.gamesPlayed, summary, ...(userStats ? {userStats: structuredClone(userStats)} : {}) });
}

export function advancePostseasonSeries(postseason: PostseasonState, state: Pick<SeasonState, "teamRecords" | "headToHead" | "regularResults">) {
  const current = postseason.series;
  const winner = seriesWinner(current);
  if (!winner || postseason.champion) return;
  postseason.completedSeries.push(structuredClone(current));
  if (current.stage === "WORLD_SERIES") { postseason.champion = winner; return; }
  if (!postseason.pendingSeries.length) {
    const won = (id: string) => seriesWinner(postseason.completedSeries.find(series => series.id === id)!)!;
    if (current.stage === "WILD_CARD") {
      for (const league of leagues) {
        const seeds = postseason.leagueSeeds[league];
        // 재시드 없이 고정 대진: 1번 시드 vs 4/5 승자, 2번 시드 vs 3/6 승자.
        postseason.pendingSeries.push(makeSeries(`${league}-DS1`, league, "DIVISION_SERIES", seeds[0], won(`${league}-WC45`), seeds), makeSeries(`${league}-DS2`, league, "DIVISION_SERIES", seeds[1], won(`${league}-WC36`), seeds));
      }
    } else if (current.stage === "DIVISION_SERIES") {
      for (const league of leagues) {
        const seeds = postseason.leagueSeeds[league];
        const teams = [won(`${league}-DS1`), won(`${league}-DS2`)].sort((a,b) => seeds.indexOf(a) - seeds.indexOf(b));
        postseason.pendingSeries.push(makeSeries(`${league}-CS`, league, "CHAMPIONSHIP_SERIES", teams[0], teams[1], seeds));
      }
    } else {
      const teams = rankMlbTeams([won("AL-CS"), won("NL-CS")], state.teamRecords, state.headToHead, state.regularResults);
      const world = makeSeries("WS", "MLB", "WORLD_SERIES", teams[0], teams[1], teams);
      world.higherSeedNumber = postseason.leagueSeeds[teamStructure[teams[0]].league].indexOf(teams[0]) + 1;
      world.lowerSeedNumber = postseason.leagueSeeds[teamStructure[teams[1]].league].indexOf(teams[1]) + 1;
      postseason.pendingSeries.push(world);
    }
  }
  postseason.series = postseason.pendingSeries.shift()!;
}

export function postseasonFixture(series: PostseasonSeries, overallGameIndex: number): GameFixture {
  const pattern = series.stage === "WILD_CARD" ? [true,true,true] : series.stage === "DIVISION_SERIES" ? [true,true,false,false,true] : [true,true,false,false,false,true,true];
  const home = pattern[series.gamesPlayed] ? series.higherSeed : series.lowerSeed;
  return { id: `postseason-${series.id}-${series.gamesPlayed + 1}`, postseasonSeriesId: series.id, day: 200 + overallGameIndex, series: overallGameIndex, gameInSeries: series.gamesPlayed + 1, seriesLength: pattern.length, home, away: home === series.higherSeed ? series.lowerSeed : series.higherSeed };
}

export function postseasonBattingBySeries(state: SeasonState): PostseasonBattingSummary[] {
  if (!state.postseason) return [];
  const rows = new Map<PostseasonSeries["stage"], PostseasonBattingSummary>();
  const add = (stage: PostseasonSeries["stage"], stats?: BatterStats) => {
    const row = rows.get(stage) ?? {stage, games: 0, playerStats: emptyBatterStats(), complete: true};
    row.games++; row.complete &&= stats !== undefined;
    if (stats) row.playerStats = sumBatterStats([row.playerStats, stats]);
    rows.set(stage, row);
  };
  for (const game of state.postseason.games) if (game.summary.away === state.config.userTeam || game.summary.home === state.config.userTeam) add(game.stage, game.userStats);
  const game = state.game;
  if (game && !game.finalized && game.competition !== "REGULAR_SEASON" && (game.fixture.away === state.config.userTeam || game.fixture.home === state.config.userTeam)) add(game.competition, game.userGameStats);
  return [...rows.values()].sort((a,b) => stages.indexOf(a.stage) - stages.indexOf(b.stage));
}
