import { describe, expect, it } from "vitest";
import { defaultPitcherDataset } from "../data";
import { applyPitchChoice, combinedWalks, createPitcherCareer, disabledReason, emptyPitchingStats, finalizePitchingMilestones, kPerNine, nextPitcherStart, pitcherKey, relievePitcher, USER_PITCHER_ID } from "../engine";
import { pitcherRankings } from "../leaderboard";
import { parsePitcherSave, serializePitcherSave } from "../storage";
import type { League, PitcherState, StartInterval } from "../types";

function career(league: League = "KBO", slot = 1) {
  const dataset = defaultPitcherDataset(league);
  return createPitcherCareer({ league, dataId: dataset.id, playerName: "새 에이스", teamId: league === "KBO" ? "SAM" : "BOS", throws: "R", debutYear: 2026, rotationSlot: slot, targetEra: 0, seed: 712 }, dataset);
}
function finishWithStrikeouts(initial: PitcherState) {
  let state = initial;
  for (let safety = 0; state.game!.phase === "PITCHING" && safety < 100; safety++) state = applyPitchChoice(state, "K");
  expect(state.game!.phase).toBe("FINISHED");
  return state;
}
function teamMatch(state: PitcherState) {
  return state.schedule.filter((fixture) => [fixture.home, fixture.away].includes(state.config.teamId)).findIndex((fixture) => fixture.id === state.game!.fixture.id) + 1;
}

describe("주자 아웃 선택과 문자중계", () => {
  it("도루실패·견제사는 가장 앞선 주자만 아웃시키고 타석과 연속 타자 기록을 유지한다", () => {
    let state = applyPitchChoice(career(), "K");
    state = applyPitchChoice(state, "BB");
    state = applyPitchChoice(state, "2B");
    const before = structuredClone(state.game!);
    state = applyPitchChoice(state, "CS");
    expect(state.game!.stats.outs).toBe(before.stats.outs + 1);
    expect(state.game!.stats.battersFaced).toBe(before.stats.battersFaced);
    expect(state.game!.battingIndex).toEqual(before.battingIndex);
    expect(state.game!.streaks).toEqual(before.streaks);
    expect(state.game!.bases.filter(Boolean)).toHaveLength(before.bases.filter(Boolean).length - 1);
    expect(state.game!.log.at(-1)?.text).toMatch(/도루실패|견제사/);
    expect(state.game!.log.at(-1)?.outcome).toBe("CS");
    expect(parsePitcherSave(serializePitcherSave(state))).toEqual(state);
  });
  it("주자가 없으면 거부하고 세 번째 아웃이면 다음 수비 이닝으로 넘긴다", () => {
    let state = career();
    expect(disabledReason(state, "CS")).toBeTruthy();
    expect(() => applyPitchChoice(state, "CS")).toThrow();
    state = applyPitchChoice(applyPitchChoice(applyPitchChoice(state, "K"), "K"), "BB");
    const batters = state.game!.stats.battersFaced;
    const streaks = state.game!.streaks;
    state = applyPitchChoice(state, "CS");
    expect(state.game!.inning).toBe(2);
    expect(state.game!.outs).toBe(0);
    expect(state.game!.stats.outs).toBe(3);
    expect(state.game!.stats.battersFaced).toBe(batters);
    expect(state.game!.streaks).toEqual(streaks);
    expect(state.game!.bases).toEqual([null, null, null]);
  });
  it("범타와 자동 경기 중계에 NO HIT를 쓰지 않는다", () => {
    const state = finishWithStrikeouts(applyPitchChoice(career(), "OUT"));
    expect(state.game!.log.some((entry) => entry.text.includes("NO HIT"))).toBe(false);
    expect(state.game!.log.some((entry) => /땅볼|뜬공|직선타/.test(entry.text))).toBe(true);
  });
});

describe("기록 집계", () => {
  it("볼넷에 고의사구를 중복 합산하지 않고 사구를 포함한다", () => {
    let state = career();
    for (const choice of ["BB", "IBB", "HBP"] as const) state = applyPitchChoice(state, choice);
    expect(combinedWalks(state.game!.stats)).toBe(3);
    expect(state.game!.stats.intentionalWalks).toBe(1);
    expect(state.game!.stats.hitByPitch).toBe(1);
    expect(kPerNine({ ...emptyPitchingStats(), strikeouts: 7, outs: 20 })).toBeCloseTo(9.45);
    expect(kPerNine(emptyPitchingStats())).toBeNull();
  });
  it.each([[17, 3, 0, 0], [18, 3, 1, 0], [20, 3, 1, 0], [21, 3, 1, 1], [21, 4, 0, 0]])("%i아웃 %i실점의 QS·QS+를 확정한다", (outs, runs, qs, qsPlus) => {
    const stats = { ...emptyPitchingStats(), games: 1, starts: 1, outs, runs, earnedRuns: 0 };
    finalizePitchingMilestones(stats);
    expect([stats.qualityStarts, stats.qualityStartsPlus]).toEqual([qs, qsPlus]);
  });
  it("무피안타여도 실점한 경기는 노히트노런 횟수에 넣지 않는다", () => {
    const stats = { ...emptyPitchingStats(), starts: 1, outs: 27, noHitters: 1, runs: 1 };
    finalizePitchingMilestones(stats);
    expect(stats.noHitNoRuns).toBe(0);
    stats.runs = 0; finalizePitchingMilestones(stats);
    expect(stats.noHitNoRuns).toBe(1);
  });
  it("완료된 등판의 QS·QS+·노히트노런을 시즌과 리그 기록에 한 번씩 반영한다", () => {
    const state = finishWithStrikeouts(career());
    expect(state.game!.stats.qualityStarts).toBe(1);
    expect(state.stats.qualityStarts).toBe(1);
    expect(state.stats.qualityStartsPlus).toBe(1);
    expect(state.stats.noHitNoRuns).toBe(1);
    expect(state.leaguePitching[pitcherKey(state.config.teamId, USER_PITCHER_ID)]).toEqual(state.stats);
  });
});

describe("선택한 팀 경기 간격", () => {
  it.each(["KBO", "MLB"] as const)("%s에서 3·4·5경기 간격을 바꾸면 MATCH 1→4→8→13에 등판한다", (league) => {
    let state = career(league);
    expect(teamMatch(state)).toBe(1);
    for (const [interval, expected] of [[3, 4], [4, 8], [5, 13]] as [StartInterval, number][]) {
      state = nextPitcherStart(relievePitcher(state), interval);
      expect(teamMatch(state)).toBe(expected);
      expect(state.records[state.config.teamId].games).toBe(expected - 1);
      expect(state.startInterval).toBe(interval);
      expect(state.nextStartGameNumber).toBe(expected);
      expect(parsePitcherSave(serializePitcherSave(state))).toEqual(state);
    }
    const ownResults = state.results.filter((result) => [result.fixture.home, result.fixture.away].includes(state.config.teamId));
    expect(ownResults.flatMap((result, index) => result.controlled ? [index + 1] : [])).toEqual([1, 4, 8]);
  });
  it("시즌 끝을 넘는 다음 등판은 남은 경기만 마무리한다", () => {
    let state = career();
    while (!state.seasonComplete) state = nextPitcherStart(relievePitcher(state), 3);
    expect(state.records[state.config.teamId].games).toBe(144);
    expect(state.stats.starts).toBe(48);
    expect(state.results).toHaveLength(state.schedule.length);
    expect(parsePitcherSave(serializePitcherSave(state))).toEqual(state);
  }, 20000);
});

describe("실제 경기에서 쌓은 투수 순위와 저장", () => {
  it.each(["KBO", "MLB"] as const)("%s의 자동 등판은 팀 실점과 투수 실점 합계가 일치하고 공동 순위를 매긴다", (league) => {
    const state = nextPitcherStart(finishWithStrikeouts(career(league)), 5);
    for (const result of state.results) {
      const lines = Object.values(result.pitching!);
      for (const [team, runs] of [[result.fixture.home, result.awayScore], [result.fixture.away, result.homeScore]]) {
        expect(lines.filter((line) => line.teamId === team).reduce((sum, line) => sum + line.stats.runs, 0)).toBe(runs);
      }
      expect(lines.reduce((sum, line) => sum + line.stats.wins, 0)).toBe(result.homeScore === result.awayScore ? 0 : 1);
      expect(lines.reduce((sum, line) => sum + line.stats.losses, 0)).toBe(result.homeScore === result.awayScore ? 0 : 1);
    }
    const rows = pitcherRankings(state, "era", false);
    expect(rows.some((row) => row.user)).toBe(true);
    expect(rows.some((row) => !row.user && row.stats.outs > 0)).toBe(true);
    expect(rows.filter((row) => row.stats.earnedRuns === 0 && row.stats.outs > 0).every((row) => row.rank === 1)).toBe(true);
    expect(pitcherRankings(state, "era", true).every((row) => row.qualified)).toBe(true);
    expect(parsePitcherSave(serializePitcherSave(state))).toEqual(state);
  });
  it("승리 순위는 미규정 선수도 포함하고 타이 다음 순위를 건너뛴다", () => {
    const state = career();
    state.leaguePitching = {};
    const team = state.dataset.teams[state.config.teamId];
    const players = team.pitchers.filter((pitcher) => pitcher.role === "SP").slice(0, 3);
    players.forEach((player, index) => { state.leaguePitching[pitcherKey(team.id, player.id)] = { ...emptyPitchingStats(), games: 5, starts: 5, wins: index < 2 ? 3 : 2 }; });
    expect(pitcherRankings(state, "wins").map((row) => [row.rank, row.stats.wins])).toEqual([[1, 3], [1, 3], [3, 2]]);
    expect(pitcherRankings(state, "era")).toEqual([]);
  });
  it("기존 세이브의 현재 시즌 달성 기록은 복원하고 리그 순위는 새 경기부터 수집한다", () => {
    const original = nextPitcherStart(finishWithStrikeouts(career()), 5);
    const legacy = JSON.parse(JSON.stringify(original), (_key, value) => {
      if (value && typeof value === "object") for (const key of ["qualityStarts", "qualityStartsPlus", "noHitNoRuns", "pitching", "pitcherKey", "winnerKey", "loserKey", "leaguePitching", "leaguePitchingSinceGames", "nextStartGameNumber", "startInterval"]) delete value[key];
      return value;
    });
    let loaded = parsePitcherSave(JSON.stringify(legacy));
    expect(loaded.stats.qualityStarts).toBe(1);
    expect(loaded.stats.qualityStartsPlus).toBe(1);
    expect(loaded.stats.noHitNoRuns).toBe(1);
    expect(pitcherRankings(loaded, "wins")).toEqual([]);
    loaded = nextPitcherStart(relievePitcher(loaded), 3);
    expect(pitcherRankings(loaded, "wins").length).toBeGreaterThan(0);
    expect(loaded.stats.starts).toBe(2);
    expect(parsePitcherSave(serializePitcherSave(loaded))).toEqual(loaded);
  });
  it("리그 집계의 변조와 잘못된 압축 데이터를 거부한다", () => {
    const state = finishWithStrikeouts(career());
    const key = pitcherKey(state.config.teamId, USER_PITCHER_ID);
    state.leaguePitching[key].strikeouts++;
    expect(() => parsePitcherSave(JSON.stringify(state))).toThrow();
    expect(() => parsePitcherSave('{"$pitching":[-1]}')).toThrow();
  });
  it("MLB 전체 시즌과 투수 순위를 브라우저 저장 용량에 맞춘다", () => {
    let state = career("MLB");
    while (!state.seasonComplete) state = nextPitcherStart(relievePitcher(state));
    const contents = serializePitcherSave(state);
    expect(contents.length * 2).toBeLessThan(5 * 1024 * 1024);
    expect(contents.length).toBeLessThan(JSON.stringify(state).length / 2);
    expect(parsePitcherSave(contents)).toEqual(state);
  }, 20000);
});
