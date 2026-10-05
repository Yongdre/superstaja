import { describe, expect, it } from "vitest";
import { defaultPitcherDataset, datasetsFor, datasetIssues } from "../data";
import { addPitchingStats, applyPitchChoice, careerStats, createPitcherCareer, currentSeasonStats, disabledReason, emptyPitchingStats, era, innings, nextPitcherSeason, nextPitcherStart, relievePitcher } from "../engine";
import { parsePitcherSave } from "../storage";
import type { League, PitchChoice, PitcherState, Runner } from "../types";

function career(league: League = "KBO", rotationSlot = 1, seed = 321): PitcherState {
  const dataset = defaultPitcherDataset(league);
  return createPitcherCareer({ league, dataId: dataset.id, playerName: "테스트 에이스", teamId: league === "KBO" ? "SAM" : "BOS", throws: "R", debutYear: 2026, rotationSlot, targetEra: 2.8, seed }, dataset);
}
const runner = (name: string, responsibleUser = true): Runner => ({ id: name, name, responsibleUser, earned: true });
const putRunners = (state: PitcherState, bases: (Runner | null)[], outs = 0) => {
  state.game!.bases = bases as [Runner | null, Runner | null, Runner | null];
  state.game!.outs = outs;
};

describe("리그·실제 선수 데이터·선발 로테이션", () => {
  it("두 리그의 모든 내장 시즌을 읽는다", () => {
    expect(datasetIssues).toEqual([]);
    expect(datasetsFor("KBO").map((entry) => entry.year)).toContain(2025);
    expect(datasetsFor("MLB").map((entry) => entry.year)).toContain(2025);
    expect(Object.keys(defaultPitcherDataset("KBO").teams)).toHaveLength(10);
    expect(Object.keys(defaultPitcherDataset("MLB").teams)).toHaveLength(30);
  });
  it.each(["KBO", "MLB"] as const)("%s에서 처음부터 사용자 수비 타석에 멈춘다", (league) => {
    const state = career(league, 5);
    const game = state.game!;
    expect(game.phase).toBe("PITCHING");
    expect(game.half === "TOP" ? game.fixture.home : game.fixture.away).toBe(state.config.teamId);
    expect(state.records[state.config.teamId].games).toBe(4);
    expect(currentSeasonStats(state).starts).toBe(1);
    expect(state.dataset.teams[game.fixture.home].hitters[0].name).toBeTruthy();
  });
  it.each(["KBO", "MLB"] as const)("%s 일정에서 각 구단의 전체 경기 수와 홈/원정을 보존한다", (league) => {
    const state = career(league);
    const games = league === "KBO" ? 144 : 162;
    for (const team of Object.keys(state.dataset.teams)) {
      expect(state.schedule.filter((fixture) => fixture.home === team)).toHaveLength(games / 2);
      expect(state.schedule.filter((fixture) => fixture.away === team)).toHaveLength(games / 2);
    }
  });
});

describe("직접 선택한 투구 결과", () => {
  it("삼진은 안타·주자 진루 없이 정확히 하나의 아웃과 K를 기록한다", () => {
    const state = career(); putRunners(state, [null, runner("2루"), null]);
    const result = applyPitchChoice(state, "K");
    expect(result.game!.outs).toBe(1);
    expect(result.game!.stats.outs).toBe(1);
    expect(result.game!.stats.strikeouts).toBe(1);
    expect(result.game!.bases[1]?.name).toBe("2루");
    expect(result.game!.stats.hits).toBe(0);
    expect(state.game!.stats.strikeouts).toBe(0);
  });
  it.each(["1B", "2B", "3B", "HR"] as const)("%s 선택을 다른 타석 결과로 바꾸지 않는다", (choice) => {
    const result = applyPitchChoice(career(), choice);
    const stats = result.game!.stats;
    expect(stats.hits).toBe(1);
    expect(stats.battersFaced).toBe(1);
    expect(stats.outs).toBe(0);
    if (choice === "2B") expect(stats.doubles).toBe(1);
    if (choice === "3B") expect(stats.triples).toBe(1);
    if (choice === "HR") expect(stats.homeRuns).toBe(1);
    expect(result.game!.log.at(-1)?.kind).toBe("choice");
  });
  it.each(["BB", "IBB", "HBP"] as const)("만루 %s는 밀어내기 실점·자책과 강제 진루를 기록한다", (choice) => {
    const state = career(); putRunners(state, [runner("1루"), runner("2루"), runner("3루")]);
    const result = applyPitchChoice(state, choice).game!;
    expect(result.stats.runs).toBe(1);
    expect(result.stats.earnedRuns).toBe(1);
    expect(result.stats.hits).toBe(0);
    expect(result.bases[1]?.name).toBe("1루");
    expect(result.bases[2]?.name).toBe("2루");
    expect(result.stats.walks).toBe(choice === "HBP" ? 0 : 1);
    expect(result.stats.intentionalWalks).toBe(choice === "IBB" ? 1 : 0);
    expect(result.stats.hitByPitch).toBe(choice === "HBP" ? 1 : 0);
    if (choice === "IBB") expect(result.stats.pitches).toBe(0);
  });
  it("빈 1루에서 볼넷이면 2·3루 주자는 움직이지 않는다", () => {
    const state = career(); putRunners(state, [null, runner("2루"), runner("3루")]);
    const game = applyPitchChoice(state, "BB").game!;
    expect(game.bases[1]?.name).toBe("2루");
    expect(game.bases[2]?.name).toBe("3루");
    expect(game.stats.runs).toBe(0);
  });
  it("만루 홈런은 네 실점·네 자책·한 피홈런이다", () => {
    const state = career(); putRunners(state, [runner("1루"), runner("2루"), runner("3루")]);
    const game = applyPitchChoice(state, "HR").game!;
    expect(game.stats.runs).toBe(4);
    expect(game.stats.earnedRuns).toBe(4);
    expect(game.stats.homeRuns).toBe(1);
    expect(game.bases).toEqual([null, null, null]);
  });
  it("희생번트는 아웃을 하나 늘리고 주자를 진루시킨다", () => {
    const state = career(); putRunners(state, [runner("1루"), runner("2루"), null]);
    const game = applyPitchChoice(state, "SH").game!;
    expect(game.outs).toBe(1);
    expect(game.stats.sacrificeBunts).toBe(1);
    expect(game.bases.map((item) => item?.name ?? null)).toEqual([null, "1루", "2루"]);
  });
  it("무주자·2사·3루 주자 상황에서는 희생번트를 거부한다", () => {
    const state = career();
    expect(disabledReason(state, "SH")).toBeTruthy();
    putRunners(state, [runner("1루"), null, null], 2);
    expect(() => applyPitchChoice(state, "SH")).toThrow();
    putRunners(state, [null, null, runner("3루")]);
    expect(() => applyPitchChoice(state, "SH")).toThrow();
  });
  it("도루는 확정 성공이며 타자·타석 수·아웃·투구 수를 바꾸지 않는다", () => {
    const state = career(); putRunners(state, [runner("1루"), null, null]);
    const before = state.game!.battingIndex;
    const game = applyPitchChoice(state, "SB").game!;
    expect(game.bases.map((item) => item?.name ?? null)).toEqual([null, "1루", null]);
    expect(game.stats.stolenBases).toBe(1);
    expect(game.stats.battersFaced).toBe(0);
    expect(game.stats.pitches).toBe(0);
    expect(game.outs).toBe(0);
    expect(game.battingIndex).toEqual(before);
  });
  it("폭투는 주자를 한 베이스씩 진루시키며 타석을 끝내지 않는다", () => {
    const state = career(); putRunners(state, [runner("1루"), runner("2루"), runner("3루")]);
    const before = state.game!.battingIndex;
    const game = applyPitchChoice(state, "WP").game!;
    expect(game.bases.map((item) => item?.name ?? null)).toEqual([null, "1루", "2루"]);
    expect(game.stats.wildPitches).toBe(1);
    expect(game.stats.pitches).toBe(1);
    expect(game.stats.runs).toBe(1);
    expect(game.stats.earnedRuns).toBe(1);
    expect(game.stats.battersFaced).toBe(0);
    expect(game.battingIndex).toEqual(before);
  });
  it("무주자 도루·폭투와 만루 도루를 거부한다", () => {
    const state = career();
    expect(() => applyPitchChoice(state, "SB")).toThrow();
    expect(() => applyPitchChoice(state, "WP")).toThrow();
    putRunners(state, [runner("1루"), runner("2루"), runner("3루")]);
    expect(() => applyPitchChoice(state, "SB")).toThrow();
  });
  it("NO HIT는 삼진·피안타 없이 범타를 기록한다", () => {
    const game = applyPitchChoice(career(), "OUT").game!;
    expect(game.stats.outs).toBe(1);
    expect(game.stats.strikeouts).toBe(0);
    expect(game.stats.hits).toBe(0);
  });
  it("이닝의 마지막 아웃 후 공격을 자동 진행하고 다음 수비 타석에 멈춘다", () => {
    let state = career();
    state = applyPitchChoice(applyPitchChoice(applyPitchChoice(state, "K"), "K"), "K");
    expect(state.game!.inning).toBe(2);
    expect(state.game!.outs).toBe(0);
    expect(state.game!.bases).toEqual([null, null, null]);
    expect(state.game!.stats.strikeouts).toBe(3);
    expect(state.game!.stats.outs).toBe(3);
  });
  it("목표 방어율을 초과해도 모든 유효 타석 결과를 고를 수 있다", () => {
    const state = career(); state.config.targetEra = 0;
    const next = applyPitchChoice(state, "HR");
    expect(disabledReason(next, "HR")).toBeNull();
    expect(era(currentSeasonStats(applyPitchChoice(next, "K")))).toBe(27);
  });
});

describe("교체·승패·완투·방어율", () => {
  it("이닝은 소수가 아닌 아웃 수로 계산한다", () => {
    expect(innings(20)).toBe("6.2");
    expect(era({ outs: 20, earnedRuns: 2 })).toBe(2.7);
    expect(era({ outs: 0, earnedRuns: 0 })).toBeNull();
    expect(addPitchingStats({ ...emptyPitchingStats(), outs: 20 }, { ...emptyPitchingStats(), outs: 20 }).outs).toBe(40);
  });
  it("교체 이후에는 선발 아웃·K·피안타·투구 수를 늘리지 않는다", () => {
    const state = applyPitchChoice(career(), "K");
    const result = relievePitcher(state);
    expect(result.game!.phase).toBe("FINISHED");
    expect(result.game!.stats.outs).toBe(1);
    expect(result.game!.stats.strikeouts).toBe(1);
    expect(result.game!.stats.hits).toBe(0);
    expect(result.game!.stats.pitches).toBe(state.game!.stats.pitches);
    expect(result.game!.stats.wins).toBe(0);
    expect(result.game!.stats.completeGames).toBe(0);
    expect(result.stats.starts).toBe(1);
    expect(currentSeasonStats(result).starts).toBe(1);
  });
  it("교체 이후 남긴 주자의 득점은 선발 실점·자책으로 귀속한다", () => {
    const state = career(); putRunners(state, [runner("1루"), runner("2루"), runner("3루")]);
    const finished = relievePitcher(state).game!;
    expect(finished.stats.runs).toBeGreaterThan(0);
    expect(finished.stats.runs).toBeLessThanOrEqual(3);
    expect(finished.stats.earnedRuns).toBe(finished.stats.runs);
    expect(finished.stats.hits).toBe(0);
  });
  it.each(["KBO", "MLB"] as const)("%s에서 27개 삼진으로 완투·완봉·퍼펙트를 기록한다", (league) => {
    let state = career(league);
    const game = state.game!;
    game.score[state.config.teamId] = 100;
    game.goAhead = { team: state.config.teamId, winUser: true, lossUser: false };
    for (let index = 0; index < 27; index++) state = applyPitchChoice(state, "K");
    expect(state.game!.phase).toBe("FINISHED");
    expect(state.game!.decision).toBe("W");
    expect(state.stats.strikeouts).toBe(27);
    expect(state.stats.completeGames).toBe(1);
    expect(state.stats.shutouts).toBe(1);
    expect(state.stats.noHitters).toBe(1);
    expect(state.stats.perfectGames).toBe(1);
  });
  it("MLB 연장 자동 주자의 폭투 득점은 비자책이다", () => {
    let state = career("MLB");
    const game = state.game!;
    const own = state.config.teamId;
    const other = game.fixture.away === own ? game.fixture.home : game.fixture.away;
    game.fixture = { ...game.fixture, home: other, away: own };
    game.inning = 9; game.half = "BOTTOM";
    game.score[game.fixture.home] = 0; game.score[game.fixture.away] = 0;
    // The third out in a tied ninth starts the top of the tenth with the automatic runner.
    putRunners(state, [null, null, null], 2);
    state = applyPitchChoice(state, "K");
    expect(state.game!.inning).toBe(10);
    expect(state.game!.bases[1]?.earned).toBe(false);
    state = applyPitchChoice(applyPitchChoice(state, "WP"), "WP");
    expect(state.game!.stats.runs).toBe(1);
    expect(state.game!.stats.earnedRuns).toBe(0);
  });
  it("9회말 만루 홈런은 끝내기 상황에서도 네 득점을 모두 기록한다", () => {
    const state = career();
    const game = state.game!;
    // Set the opponent to home so the user is pitching in a walk-off situation.
    const own = state.config.teamId;
    const other = game.fixture.away === own ? game.fixture.home : game.fixture.away;
    game.fixture = { ...game.fixture, home: other, away: own };
    game.inning = 9; game.half = "BOTTOM";
    game.score[own] = 0; game.score[other] = 0;
    putRunners(state, [runner("1루"), runner("2루"), runner("3루")]);
    const result = applyPitchChoice(state, "HR").game!;
    expect(result.phase).toBe("FINISHED");
    expect(result.score[other]).toBe(4);
    expect(result.stats.runs).toBe(4);
    expect(result.decision).toBe("L");
  });
});

describe("시즌·통산·세이브 회귀", () => {
  it("JSON 복원 후 같은 선택은 같은 경기·난수·기록을 만든다", () => {
    let state = career("MLB", 3);
    for (const choice of ["BB", "SB", "1B", "K", "WP"] as PitchChoice[]) state = applyPitchChoice(state, choice);
    const loaded = parsePitcherSave(JSON.stringify(state));
    expect(loaded).toEqual(state);
    expect(applyPitchChoice(loaded, "HR")).toEqual(applyPitchChoice(state, "HR"));
  });
  it("슈퍼스타자 세이브·손상된 기록·잘못된 일정을 거부한다", () => {
    expect(() => parsePitcherSave('{"schemaVersion":4}')).toThrow();
    const state = relievePitcher(career());
    const badStats = structuredClone(state); badStats.stats.strikeouts++;
    expect(() => parsePitcherSave(JSON.stringify(badStats))).toThrow();
    const badSchedule = structuredClone(state); badSchedule.schedule[0].home = "INVALID";
    expect(() => parsePitcherSave(JSON.stringify(badSchedule))).toThrow();
    const badRunner = career(); badRunner.game!.bases = [] as unknown as [Runner | null, Runner | null, Runner | null];
    expect(() => parsePitcherSave(JSON.stringify(badRunner))).toThrow();
  });
  it.each([["KBO", 1, 29], ["KBO", 5, 28], ["MLB", 1, 33], ["MLB", 5, 32]] as const)("%s %i선발은 전체 시즌에서 %i번 등판하고 모든 팀의 경기를 마친다", (league, slot, starts) => {
    let state = career(league, slot);
    while (!state.seasonComplete) {
      state = relievePitcher(state);
      state = nextPitcherStart(state);
    }
    expect(state.stats.starts).toBe(starts);
    expect(state.results).toHaveLength(state.schedule.length);
    for (const record of Object.values(state.records)) {
      expect(record.games).toBe(league === "KBO" ? 144 : 162);
      expect(record.wins + record.losses + record.ties).toBe(record.games);
      if (league === "MLB") expect(record.ties).toBe(0);
    }
    expect(parsePitcherSave(JSON.stringify(state))).toEqual(state);
    const next = nextPitcherSeason(state, 2.5);
    expect(next.year).toBe(2027);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].stats).toEqual(state.stats);
    expect(next.config.targetEra).toBe(2.5);
    expect(careerStats(next).starts).toBe(starts + 1);
    expect(parsePitcherSave(JSON.stringify(next))).toEqual(next);
  }, 20000);
});
