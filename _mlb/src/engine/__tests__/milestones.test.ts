import { describe, expect, it } from "vitest";
import { createGame, createNewSeason, applyUserChoice, resolveUserSteal, revealGameResult, startNextGame, startNextSeason, validateSave } from "../gameEngine";
import { forcedNoHitRemaining, formatTeamStreak, hasCycle, recordUserGame, scoreForTeam, teamResult, userGameStreaks } from "../milestones";
import { recordGame } from "../standings";
import { emptyBatterStats } from "../statistics";
import type { BatterStats, SeasonState } from "../types";

function setup() {
  return createNewSeason({ playerName: "테스트", targetAvgMax: .300, enforceHomeRunCap: false, seed: 81 });
}
function highAverage() {
  const state = setup();
  state.teamRecords[state.config.userTeam].games = 100;
  state.playerStats["USER-PLAYER"] = { ...emptyBatterStats(), pa: 1000, ab: 1000, h: 1000 };
  return state;
}
function finishGame(source: SeasonState) {
  let state = source;
  for (let steps = 0; !state.game!.finalized && steps < 300; steps++) {
    if (state.game!.phase === "USER_AT_BAT") state = applyUserChoice(state, "OUT");
    else if (state.game!.phase === "WAITING_FOR_STEAL") state = resolveUserSteal(state, false);
    else throw Error(state.game!.phase);
  }
  expect(state.game!.finalized).toBe(true);
  return state;
}
const stats = (values: Partial<BatterStats>) => ({ ...emptyBatterStats(), ...values });

describe("포지션과 시즌 전환", () => {
  it("DH로 데뷔하고 다음 시즌 다른 포지션과 타순을 선택한다", () => {
    const state = createNewSeason({ position: "DH" });
    expect(state.config.position).toBe("DH");
    expect(state.game!.lineups[state.config.userTeam]).toHaveLength(9);
    expect(state.game!.lineups[state.config.userTeam].filter(id => id === "USER-PLAYER")).toHaveLength(1);
    state.game!.phase = "SEASON_END";
    state.battingRestriction = { remaining: 3 };
    state.userGameHistory = [{ fixtureId: "old", competition: "REGULAR_SEASON", stats: stats({h: 1}) }];
    const next = startNextSeason(state, { ...state.config, position: "C", battingOrder: 4 });
    expect(next.config.position).toBe("C");
    expect(next.game!.lineups[next.config.userTeam][3]).toBe("USER-PLAYER");
    expect(next.battingRestriction).toBeUndefined();
    expect(next.userGameHistory).toEqual([]);
    // MLB은 사용자 팀의 첫 경기 전 휴식일에 타 구장 경기를 진행할 수 있다.
    expect(next.regularResults.every(result => result.fixtureId.startsWith(next.season + "-"))).toBe(true);
    expect(next.regularResults.some(result => result.summary.away === next.config.userTeam || result.summary.home === next.config.userTeam)).toBe(false);
  });
  it("포지션을 생략한 기존 호출과 저장은 직전 포지션을 유지한다", () => {
    const state = createNewSeason({ position: "DH" });
    state.game!.phase = "SEASON_END";
    const { position: _position, ...goals } = state.config;
    expect(startNextSeason(state, goals).config.position).toBe("DH");
    expect(validateSave(JSON.parse(JSON.stringify(state))).config.position).toBe("DH");
  });
});

describe("목표 타율 강제 NO HIT", () => {
  it("100번째 경기까지 제한하지 않고 101번째 경기부터 .080 경계를 적용한다", () => {
    const state = highAverage();
    const record = state.teamRecords[state.config.userTeam];
    const user = state.playerStats["USER-PLAYER"];
    record.games = 99;
    expect(forcedNoHitRemaining(state)).toBe(0);
    record.games = 100;
    user.h = 379;
    expect(forcedNoHitRemaining(state)).toBe(0);
    user.h = 380;
    expect(forcedNoHitRemaining(state)).toBe(10);
    state.game!.competition = "WILD_CARD";
    expect(forcedNoHitRemaining(state)).toBe(0);
  });
  it("금지된 선택은 기록, RNG, 남은 타석 모두 변경하지 않는다", () => {
    const state = highAverage();
    for (const choice of ["1B", "2B", "3B", "HR", "BB", "HBP", "IBB", "SF", "SH"] as const) expect(applyUserChoice(state, choice)).toBe(state);
    expect(state.battingRestriction).toBeUndefined();
  });
  it("경기 전환과 저장/불러오기를 거쳐 정확히 10타석만 제한한다", () => {
    let state = highAverage();
    const beforePA = state.playerStats["USER-PLAYER"].pa;
    for (let count = 1; count <= 10; count++) {
      while (state.game!.phase !== "USER_AT_BAT") {
        if (state.game!.phase === "WAITING_FOR_STEAL") state = resolveUserSteal(state, false);
        else if (state.game!.phase === "GAME_END_TRANSITION") state = revealGameResult(state);
        else if (state.game!.phase === "GAME_END") state = startNextGame(state);
        else throw Error(state.game!.phase);
      }
      expect(forcedNoHitRemaining(state)).toBe(11 - count);
      state = applyUserChoice(state, "OUT");
      expect(state.battingRestriction!.remaining).toBe(10 - count);
      state = validateSave(JSON.parse(JSON.stringify(state)));
    }
    expect(state.playerStats["USER-PLAYER"].pa).toBe(beforePA + 10);
    expect(forcedNoHitRemaining(state)).toBe(0);
    expect(state.battingRestriction!.cooldownFixtureId).toBe(state.game!.fixture.id);
    // Ten outs already fulfilled the penalty: don't immediately restart it in this game.
    if (state.game!.phase === "USER_AT_BAT") expect(applyUserChoice(state, "1B")).not.toBe(state);
  });
  it("저장 파일의 잘못된 남은 타석을 거부한다", () => {
    const state = highAverage();
    state.battingRestriction = { remaining: 11 };
    expect(() => validateSave(state)).toThrow("NO HIT");
  });
});

describe("일정, 연승 및 개인 연속 기록", () => {
  it("사용자가 출전하지 않은 타 구장 경기는 개인 연속 기록에 포함하지 않는다", () => {
    const state = setup();
    const fixture = state.schedule.flatMap(day => day.games).find(game => game.away !== state.config.userTeam && game.home !== state.config.userTeam)!;
    const game = createGame(state, fixture);
    // 엔진은 대기 팀의 라인업도 가지고 있으므로 라인업 존재만으로 출전을 판정하면 안 된다.
    expect(game.lineups[state.config.userTeam]).toContain("USER-PLAYER");
    recordUserGame(state, game);
    expect(state.userGameHistory).toBeUndefined();
  });
  it("완료된 경기 점수와 개인 기록을 한 번만 보관한다", () => {
    const state = finishGame(setup());
    const results = state.regularResults!.filter(result => result.fixtureId === state.game!.fixture.id);
    expect(results).toHaveLength(1);
    expect(results[0].summary).toEqual(state.game!.summary);
    const length = state.userGameHistory!.length;
    recordUserGame(state, state.game!);
    expect(state.userGameHistory).toHaveLength(length);
    expect(state.userGameHistory![0].stats).not.toBe(state.game!.userGameStats);
  });
  it("연승에서 연패로 전환하며 무승부는 연속 기록을 끊는다", () => {
    const state = setup(), away = state.game!.fixture.away, home = state.game!.fixture.home;
    for (let i = 0; i < 3; i++) recordGame(state.teamRecords, away, home, 5, 1);
    expect(formatTeamStreak(state.teamRecords[away].streak)).toBe("3연승");
    expect(formatTeamStreak(state.teamRecords[home].streak)).toBe("3연패");
    recordGame(state.teamRecords, away, home, 1, 5);
    expect(formatTeamStreak(state.teamRecords[away].streak)).toBe("1연패");
    recordGame(state.teamRecords, away, home, 2, 2);
    expect(formatTeamStreak(state.teamRecords[away].streak)).toBe("–");
  });
  it("전체 결과가 남은 기존 세이브는 연속 승패를 복원한다", () => {
    const state = finishGame(setup());
    const expected = state.teamRecords[state.config.userTeam].streak;
    delete state.teamRecords[state.config.userTeam].streak;
    expect(validateSave(state).teamRecords[state.config.userTeam].streak).toBe(expected);
  });
  it("홈/원정과 상관없이 사용자 기준 점수와 승패를 반환한다", () => {
    const state = setup(), summary = { away: state.game!.fixture.away, home: state.game!.fixture.home, awayScore: 7, homeScore: 3, winningPitcher: "", losingPitcher: "" };
    expect(teamResult(summary, summary.away)).toBe("승");
    expect(teamResult(summary, summary.home)).toBe("패");
    expect(scoreForTeam(summary, summary.away)).toBe("7–3");
    expect(scoreForTeam(summary, summary.home)).toBe("3–7");
    expect(teamResult({...summary, homeScore: 7}, summary.home)).toBe("무");
  });
  it("한 경기 여러 안타는 한 번만 세고 진행 중 무안타는 직전 기록을 유지한다", () => {
    const state = setup();
    state.userGameHistory = Array.from({length: 12}, (_, i) => ({ fixtureId: "past-" + i, competition: "REGULAR_SEASON" as const, stats: stats({ h: 3, hr: 1 }) }));
    state.game!.userGameStats = stats({});
    expect(userGameStreaks(state)).toEqual({ hits: 12, onBase: 12, homeRuns: 12 });
    state.game!.userGameStats = stats({ h: 4, hr: 2 });
    expect(userGameStreaks(state)).toEqual({ hits: 13, onBase: 13, homeRuns: 13 });
    recordUserGame(state, state.game!);
    state.game!.finalized = true;
    expect(userGameStreaks(state).hits).toBe(13);
  });
  it("볼넷/사구는 출루만 이어가고 무안타 종료는 안타와 홈런 기록을 끊는다", () => {
    const state = setup();
    state.userGameHistory = [{fixtureId: "past", competition: "REGULAR_SEASON", stats: stats({h: 1, hr: 1})}];
    state.game!.userGameStats = stats({hbp: 1});
    state.game!.finalized = true;
    expect(userGameStreaks(state)).toEqual({hits: 0, onBase: 2, homeRuns: 0});
    state.game!.userGameStats = stats({roe: 1});
    expect(userGameStreaks(state).onBase).toBe(0);
    state.game!.competition = "WILD_CARD";
    expect(userGameStreaks(state).hits).toBe(0);
  });
});

describe("사이클링 히트", () => {
  it("실제 기록에 단타, 2루타, 3루타, 홈런이 모두 있어야 한다", () => {
    expect(hasCycle(stats({h: 4, doubles: 1, triples: 1, hr: 1}))).toBe(true);
    expect(hasCycle(stats({h: 3, doubles: 1, triples: 1, hr: 1}))).toBe(false);
    for (const missing of ["doubles", "triples", "hr"] as const) expect(hasCycle(stats({h: 4, doubles: 1, triples: 1, hr: 1, [missing]: 0}))).toBe(false);
  });
});
