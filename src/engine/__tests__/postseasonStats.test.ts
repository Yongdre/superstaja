import { describe, expect, it } from "vitest";
import { applyUserChoice, createExampleSave, revealGameResult, startNextSeason, validateSave } from "../gameEngine";
import { createPostseason, postseasonBattingBySeries, recordPostseasonResult } from "../postseason";
import { emptyBatterStats } from "../statistics";

function postseasonState() {
  const state = createExampleSave();
  state.postseason = createPostseason(state.teamRecords, structuredClone(state.playerStats));
  state.progress = "POSTSEASON";
  state.postseason.series = { stage: "PLAYOFF", higherSeed: "SAM", lowerSeed: "DOO", higherSeedNumber: 2, lowerSeedNumber: 3, wins: { SAM: 0, DOO: 0 }, ties: 0, neededWins: 3, gamesPlayed: 0 };
  state.game!.competition = "PLAYOFF";
  state.game!.userGameStats = { ...emptyBatterStats(), pa: 2, ab: 2, h: 1, doubles: 1 };
  return state;
}

describe("시리즈별 타격 기록", () => {
  it("진행 중인 경기와 완료된 경기를 한 번씩 더하고 라운드별로 구분한다", () => {
    const state = postseasonState();
    const summary = { away: "DOO" as const, home: "SAM" as const, awayScore: 2, homeScore: 3, winningPitcher: "승", losingPitcher: "패" };
    const first = { ...emptyBatterStats(), pa: 4, ab: 3, h: 2, hr: 1, bb: 1 };
    recordPostseasonResult(state.postseason!, summary, first);
    first.hr = 90;
    expect(postseasonBattingBySeries(state)[0]).toMatchObject({ games: 2, complete: true, playerStats: { pa: 6, ab: 5, h: 3, hr: 1, doubles: 1 } });
    recordPostseasonResult(state.postseason!, summary, state.game!.userGameStats);
    state.game!.finalized = true;
    expect(postseasonBattingBySeries(state)[0].playerStats.pa).toBe(6);
    state.game!.competition = "KOREAN_SERIES";
    state.game!.finalized = false;
    state.game!.userGameStats = { ...emptyBatterStats(), pa: 1, bb: 1, ibb: 1 };
    const rows = postseasonBattingBySeries(state);
    expect(rows.map((row) => row.stage)).toEqual(["PLAYOFF", "KOREAN_SERIES"]);
    expect(rows[1].playerStats).toMatchObject({ pa: 1, bb: 1, ibb: 1, hr: 0 });
    expect(postseasonBattingBySeries(validateSave(JSON.parse(JSON.stringify(state))))).toEqual(rows);
  });

  it("이전 세이브의 누락된 경기 기록을 0점 성적으로 꾸미지 않는다", () => {
    const state = postseasonState();
    recordPostseasonResult(state.postseason!, { away: "DOO", home: "SAM", awayScore: 2, homeScore: 3, winningPitcher: "승", losingPitcher: "패" });
    expect(postseasonBattingBySeries(state)[0].complete).toBe(false);
  });

  it("사용자 팀이 참가하지 않은 시리즈는 선수 기록에 포함하지 않는다", () => {
    const state = postseasonState();
    state.game!.fixture.home = "KIA";
    state.game!.fixture.away = "LOT";
    recordPostseasonResult(state.postseason!, { away: "LOT", home: "KIA", awayScore: 2, homeScore: 3, winningPitcher: "승", losingPitcher: "패" });
    expect(postseasonBattingBySeries(state)).toEqual([]);
  });

  it("시리즈 마지막 타석도 포함해 보존하고 다음 시즌으로 넘긴다", () => {
    const state = postseasonState();
    state.postseason!.series.stage = "KOREAN_SERIES";
    state.postseason!.series.neededWins = 4;
    state.postseason!.series.wins = { SAM: 3, DOO: 0 };
    state.game!.competition = "KOREAN_SERIES";
    state.game!.inning = 9;
    state.game!.outs = 0;
    state.game!.score.SAM = state.game!.score.DOO = 3;
    state.game!.bases = [null, null, { playerId: "SAM-BYH", name: "박해민", teamId: "SAM", speed: 90, isUser: false }];
    state.career.seasons.push({ season: state.season, teamId: "SAM", playerStats: structuredClone(state.playerStats["USER-PLAYER"]), teamRecord: state.teamRecords.SAM, goals: state.config });
    const regularBefore = structuredClone(state.playerStats["USER-PLAYER"]);
    const finished = applyUserChoice(state, "SF");
    expect(finished.progress).toBe("SEASON_COMPLETE");
    expect(finished.playerStats["USER-PLAYER"]).toEqual(regularBefore);
    expect(finished.career.seasons[0].postseason!.seriesStats![0]).toMatchObject({ games: 1, playerStats: { pa: 3, ab: 2, sf: 1, rbi: 1 } });
    const restored = validateSave(JSON.parse(JSON.stringify(finished)));
    const next = startNextSeason(revealGameResult(restored), { ...state.config, isFinalSeason: false });
    expect(next.season).toBe(state.season + 1);
    expect(next.career.seasons[0].postseason!.seriesStats).toEqual(finished.career.seasons[0].postseason!.seriesStats);
    expect(next.postseason).toBeUndefined();
  });

  it("예전 세이브의 현재·통산·포스트시즌 희생번트를 0으로 채운다", () => {
    const state = postseasonState();
    const stats = { ...emptyBatterStats(), bb: 12, ibb: 2, hbp: 3 };
    state.career.seasons.push({ season: 2016, teamId: "SAM", playerStats: stats, teamRecord: state.teamRecords.SAM, goals: state.config, postseason: { qualified: true, champion: "SAM", playerStats: stats } });
    const legacy = JSON.parse(JSON.stringify(state, (key, value) => key === "sh" ? undefined : value));
    const restored = validateSave(legacy);
    expect(restored.playerStats["USER-PLAYER"].sh).toBe(0);
    expect(restored.game!.userGameStats.sh).toBe(0);
    expect(restored.postseason!.playerStats["USER-PLAYER"].sh).toBe(0);
    expect(restored.career.seasons[0].playerStats).toMatchObject({ sh: 0, bb: 12, ibb: 2, hbp: 3 });
    expect(restored.career.seasons[0].postseason!.playerStats.sh).toBe(0);
    expect(legacy.game.userGameStats).not.toHaveProperty("sh");
  });
});
