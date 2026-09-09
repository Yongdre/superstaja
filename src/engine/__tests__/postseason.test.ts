import { describe, expect, it } from "vitest";
import { leagueDataTemplate } from "../../data/leagueDataset";
import { eligibleBullpenPitchers, starterFor } from "../gameEngine";
import { advancePostseasonSeries, createPostseason, isSeriesClinched, recordPostseasonResult } from "../postseason";
import { emptyBatterStats } from "../statistics";
import type { GameSummary, TeamId, TeamRecord } from "../types";

const ids: TeamId[] = ["KIA", "DOO", "LOT", "NC", "SK", "LG", "NEX", "HAN", "KT", "SAM"];
const records = Object.fromEntries(ids.map((teamId, index) => [teamId, {
  games: 144,
  wins: 90 - index * 3,
  losses: 54 + index * 3,
  ties: 0,
  runsFor: 700 - index,
  runsAgainst: 500 + index,
  homeGames: 72,
  awayGames: 72,
}])) as Record<TeamId, TeamRecord>;

const summary = (away: TeamId, home: TeamId, awayScore: number, homeScore: number): GameSummary => ({
  away, home, awayScore, homeScore, winningPitcher: "승리", losingPitcher: "패전",
});

describe("포스트시즌", () => {
  it("4위 팀에 1승 어드밴티지를 주고 와일드카드부터 시작한다", () => {
    const postseason = createPostseason(records, { "USER-PLAYER": emptyBatterStats() });
    expect(postseason.seeds).toEqual(ids.slice(0, 5));
    expect(postseason.series).toMatchObject({ stage: "WILD_CARD", higherSeed: "NC", lowerSeed: "SK", neededWins: 2 });
    expect(postseason.series.wins.NC).toBe(1);
    recordPostseasonResult(postseason, summary("SK", "NC", 2, 3));
    expect(isSeriesClinched(postseason.series)).toBe(true);
    advancePostseasonSeries(postseason);
    expect(postseason.series).toMatchObject({ stage: "SEMI_PLAYOFF", higherSeed: "LOT", lowerSeed: "NC", neededWins: 3 });
  });

  it("포스트시즌 선발은 1–4선발만 순환하고 5선발은 불펜에 들어간다", () => {
    const starters = leagueDataTemplate.teams.KIA.pitchers.filter((pitcher) => pitcher.role === "SP");
    expect(Array.from({ length: 5 }, (_, game) => starterFor("KIA", game, leagueDataTemplate, "KOREAN_SERIES").id))
      .toEqual([starters[0].id, starters[1].id, starters[2].id, starters[3].id, starters[0].id]);
    const bullpenIds = eligibleBullpenPitchers("KIA", leagueDataTemplate, "KOREAN_SERIES").map((pitcher) => pitcher.id);
    expect(bullpenIds).toContain(starters[4].id);
    starters.slice(0, 4).forEach((pitcher) => expect(bullpenIds).not.toContain(pitcher.id));
  });
});
