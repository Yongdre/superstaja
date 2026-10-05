import { describe, expect, it, vi } from "vitest";
import { leagueDataTemplate } from "../../data/leagueDataset";
import { checkPitchingChange, createGame, createNewSeason, eligibleBullpenPitchers, startNextGame, validateSave } from "../gameEngine";
import { advancePostseasonSeries, createPostseason, postseasonFixture, recordPostseasonResult } from "../postseason";
import { SeededRng } from "../rng";
import type { CompetitionStage } from "../types";

describe("포스트시즌 팀별 선발 순환", () => {
  it("플레이오프 3경기 후 한국시리즈는 진출 팀 4선발, 직행 팀 1선발이다", () => {
    const state = createNewSeason({ userTeam: "DOO", battingOrder: 1 }, leagueDataTemplate);
    state.postseason = createPostseason(state.teamRecords, structuredClone(state.playerStats));
    state.postseason.seeds = ["KIA", "DOO", "LOT", "NC", "SK"];
    state.postseason.series = { stage: "PLAYOFF", higherSeed: "DOO", lowerSeed: "LOT", higherSeedNumber: 2, lowerSeedNumber: 3, wins: { DOO: 0, LOT: 0 }, ties: 0, neededWins: 3, gamesPlayed: 0 };
    const starters = state.leagueData.teams.DOO.pitchers.filter((p) => p.role === "SP");
    for (let i = 0; i < 3; i++) {
      const fixture = postseasonFixture(state.postseason.series, state.postseason.games.length);
      expect(createGame(state, fixture, "PLAYOFF").pitchers.DOO.pitcherId).toBe(starters[i].id);
      recordPostseasonResult(state.postseason, { away: "LOT", home: "DOO", awayScore: 0, homeScore: 1, winningPitcher: "", losingPitcher: "" });
    }
    advancePostseasonSeries(state.postseason);
    state.progress = "POSTSEASON";
    state.game!.phase = "GAME_END";
    const next = startNextGame(validateSave(JSON.parse(JSON.stringify(state))));
    expect(next.game!.competition).toBe("KOREAN_SERIES");
    expect(next.game!.pitchers.DOO.pitcherId).toBe(starters[3].id);
    expect(next.game!.pitchers.KIA.pitcherId).toBe(state.leagueData.teams.KIA.pitchers.filter((p) => p.role === "SP")[0].id);
    recordPostseasonResult(state.postseason, { away: "DOO", home: "KIA", awayScore: 0, homeScore: 0, winningPitcher: "", losingPitcher: "" });
    const second = createGame(state, postseasonFixture(state.postseason.series, state.postseason.games.length), "KOREAN_SERIES");
    expect(second.pitchers.DOO.pitcherId).toBe(starters[0].id);
    expect(second.pitchers.KIA.pitcherId).toBe(state.leagueData.teams.KIA.pitchers.filter((p) => p.role === "SP")[1].id);
  });
});

describe("투수 재등판 방지", () => {
  it.each<CompetitionStage>(["REGULAR_SEASON", "KOREAN_SERIES"])("%s에서 불펜을 모두 소진해도 재등판하거나 투구 수를 초기화하지 않는다", (stage) => {
    let state = createNewSeason({}, leagueDataTemplate);
    state.game = createGame(state, state.game!.fixture, stage);
    const defense = state.game.fixture.home;
    const rng = new SeededRng(1);
    vi.spyOn(rng, "chance").mockReturnValue(true);
    const seen = [state.game.pitchers[defense].pitcherId];
    const count = eligibleBullpenPitchers(defense, state.leagueData, stage).length;
    for (let i = 0; i < count + 3; i++) {
      const game = state.game!;
      game.inning = i === 0 ? 6 : 10;
      game.half = "TOP";
      game.pitchers[defense].pitchCount = 200;
      game.pitchers[defense].outsRecorded = 9;
      checkPitchingChange(state, game, rng);
      const current = game.pitchers[defense];
      if (i < count) {
        expect(seen).not.toContain(current.pitcherId);
        seen.push(current.pitcherId);
      } else {
        expect(current.pitcherId).toBe(seen.at(-1));
        expect(current.pitchCount).toBe(200);
        expect(current.outsRecorded).toBe(9);
      }
      state = validateSave(JSON.parse(JSON.stringify(state)));
    }
    expect(state.game!.pitchers[defense].usedPitcherIds).toEqual(seen);
    expect(state.game!.log.filter((e) => e.text.includes("투수 교체:"))).toHaveLength(count);
  });

  it("기존 세이브는 중계에서 불펜 이력을 복원한다", () => {
    const state = createNewSeason();
    const game = state.game!;
    const teamId = game.fixture.home;
    const reliever = eligibleBullpenPitchers(teamId, state.leagueData)[0];
    delete game.pitchers[teamId].usedPitcherIds;
    game.pitchers[teamId].bullpenIndex = 1;
    game.log.push({ id: game.nextLogId++, inning: 6, half: "TOP", important: true, text: `${state.leagueData.teams[teamId].shortName}, 투수 교체: ${reliever.name}.` });
    expect(validateSave(state).game!.pitchers[teamId].usedPitcherIds).toContain(reliever.id);
  });

  it("기존 세이브의 교체 중계가 사라졌으면 불확실한 불펜의 재등판을 막는다", () => {
    const state = createNewSeason();
    const game = state.game!;
    const teamId = game.fixture.home;
    delete game.pitchers[teamId].usedPitcherIds;
    game.pitchers[teamId].bullpenIndex = 2;
    game.log = [];
    const used = validateSave(state).game!.pitchers[teamId].usedPitcherIds;
    for (const pitcher of eligibleBullpenPitchers(teamId, state.leagueData)) expect(used).toContain(pitcher.id);
  });
});
