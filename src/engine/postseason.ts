import { calculateStandings } from "./standings";
import { emptyBatterStats, sumBatterStats } from "./statistics";
import type {
  BatterStats,
  GameFixture,
  GameSummary,
  PostseasonSeries,
  PostseasonState,
  PostseasonBattingSummary,
  SeasonState,
  TeamId,
  TeamRecord,
} from "./types";

export const postseasonStageLabel = {
  REGULAR_SEASON: "정규시즌",
  WILD_CARD: "와일드카드 결정전",
  SEMI_PLAYOFF: "준플레이오프",
  PLAYOFF: "플레이오프",
  KOREAN_SERIES: "한국시리즈",
} as const;

function makeSeries(
  stage: PostseasonSeries["stage"],
  higherSeed: TeamId,
  lowerSeed: TeamId,
  higherSeedNumber: number,
  lowerSeedNumber: number,
): PostseasonSeries {
  const neededWins = stage === "KOREAN_SERIES" ? 4 : 3;
  return {
    stage,
    higherSeed,
    lowerSeed,
    higherSeedNumber,
    lowerSeedNumber,
    wins: {
      [higherSeed]: stage === "WILD_CARD" ? 1 : 0,
      [lowerSeed]: 0,
    },
    ties: 0,
    neededWins: stage === "WILD_CARD" ? 2 : neededWins,
    gamesPlayed: 0,
  };
}

export function createPostseason(records: Record<TeamId, TeamRecord>, playerStats: PostseasonState["playerStats"]): PostseasonState {
  const seeds = calculateStandings(records).slice(0, 5).map((row) => row.teamId);
  if (seeds.length < 5) throw new Error("포스트시즌 진출 5개 팀을 정할 수 없습니다.");
  return {
    seeds,
    series: makeSeries("WILD_CARD", seeds[3], seeds[4], 4, 5),
    completedSeries: [],
    games: [],
    playerStats,
  };
}

export function isSeriesClinched(series: PostseasonSeries) {
  return (series.wins[series.higherSeed] ?? 0) >= series.neededWins
    || (series.wins[series.lowerSeed] ?? 0) >= series.neededWins;
}

export function seriesWinner(series: PostseasonSeries): TeamId | undefined {
  if ((series.wins[series.higherSeed] ?? 0) >= series.neededWins) return series.higherSeed;
  if ((series.wins[series.lowerSeed] ?? 0) >= series.neededWins) return series.lowerSeed;
  return undefined;
}

export function recordPostseasonResult(postseason: PostseasonState, summary: GameSummary, userStats?: BatterStats) {
  const series = postseason.series;
  series.gamesPlayed += 1;
  postseason.games.push({ stage: series.stage, gameNumber: series.gamesPlayed, summary,
    ...(userStats ? { userStats: structuredClone(userStats) } : {}),
  });
  if (summary.awayScore === summary.homeScore) {
    series.ties += 1;
    // 와일드카드에서는 4위 팀이 무승부만 기록해도 다음 라운드에 진출합니다.
    if (series.stage === "WILD_CARD") series.wins[series.higherSeed] = series.neededWins;
    return;
  }
  const winner = summary.awayScore > summary.homeScore ? summary.away : summary.home;
  series.wins[winner] = (series.wins[winner] ?? 0) + 1;
}

export function advancePostseasonSeries(postseason: PostseasonState) {
  const winner = seriesWinner(postseason.series);
  if (!winner) return;
  const completed = structuredClone(postseason.series);
  postseason.completedSeries.push(completed);
  switch (completed.stage) {
    case "WILD_CARD":
      postseason.series = makeSeries("SEMI_PLAYOFF", postseason.seeds[2], winner, 3, completed.higherSeed === winner ? completed.higherSeedNumber : completed.lowerSeedNumber);
      break;
    case "SEMI_PLAYOFF":
      postseason.series = makeSeries("PLAYOFF", postseason.seeds[1], winner, 2, completed.higherSeed === winner ? completed.higherSeedNumber : completed.lowerSeedNumber);
      break;
    case "PLAYOFF":
      postseason.series = makeSeries("KOREAN_SERIES", postseason.seeds[0], winner, 1, completed.higherSeed === winner ? completed.higherSeedNumber : completed.lowerSeedNumber);
      break;
    case "KOREAN_SERIES":
      postseason.champion = winner;
      break;
  }
}

const homePattern = (series: PostseasonSeries): Array<"HIGHER" | "LOWER"> => {
  if (series.stage === "WILD_CARD") return ["HIGHER", "HIGHER"];
  if (series.stage === "KOREAN_SERIES") return ["HIGHER", "HIGHER", "LOWER", "LOWER", "LOWER", "HIGHER", "HIGHER"];
  return ["HIGHER", "HIGHER", "LOWER", "LOWER", "HIGHER"];
};

export function postseasonFixture(series: PostseasonSeries, overallGameIndex: number): GameFixture {
  const pattern = homePattern(series);
  const gameIndex = series.gamesPlayed;
  const home = pattern[Math.min(gameIndex, pattern.length - 1)] === "HIGHER" ? series.higherSeed : series.lowerSeed;
  const away = home === series.higherSeed ? series.lowerSeed : series.higherSeed;
  return {
    id: `postseason-${series.stage.toLowerCase()}-${gameIndex + 1}-${overallGameIndex + 1}`,
    day: 144 + overallGameIndex,
    series: 100 + postseasonSeriesOrder(series.stage),
    gameInSeries: gameIndex + 1,
    seriesLength: pattern.length,
    away,
    home,
  };
}

function postseasonSeriesOrder(stage: PostseasonSeries["stage"]) {
  return ["WILD_CARD", "SEMI_PLAYOFF", "PLAYOFF", "KOREAN_SERIES"].indexOf(stage);
}

export function seriesIncludes(series: PostseasonSeries, teamId: TeamId) {
  return series.higherSeed === teamId || series.lowerSeed === teamId;
}

export function postseasonBattingBySeries(state: SeasonState): PostseasonBattingSummary[] {
  if (!state.postseason) return [];
  const rows = new Map<PostseasonSeries["stage"], PostseasonBattingSummary>();
  const addGame = (stage: PostseasonSeries["stage"], stats?: BatterStats) => {
    const row = rows.get(stage) ?? { stage, games: 0, playerStats: emptyBatterStats(), complete: true };
    row.games += 1;
    row.complete &&= stats !== undefined;
    if (stats) row.playerStats = sumBatterStats([row.playerStats, stats]);
    rows.set(stage, row);
  };
  const team = state.config.userTeam;
  for (const record of state.postseason.games) {
    if (record.summary.away === team || record.summary.home === team) addGame(record.stage, record.userStats);
  }
  const game = state.game;
  if (game && !game.finalized && game.competition !== "REGULAR_SEASON"
    && (game.fixture.away === team || game.fixture.home === team)) {
    addGame(game.competition, game.userGameStats);
  }
  return [...rows.values()].sort((a, b) => postseasonSeriesOrder(a.stage) - postseasonSeriesOrder(b.stage));
}
