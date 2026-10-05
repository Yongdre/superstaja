import { describe, expect, it } from "vitest";
import { gameLogEntryClasses } from "../../components/GameLog";
import { gameAchievementLabels, pitcherCelebrationsForTransition, qualityStartConditions } from "../achievements";
import { defaultPitcherDataset } from "../data";
import { applyPitchChoice, choiceLabels, createPitcherCareer, disabledReason, forcedHomeRunRemaining, nextPitcherStart, relievePitcher } from "../engine";
import { parsePitcherSave } from "../storage";
import type { PitchChoice, PitcherState, Runner } from "../types";

function career(seed = 321) {
  const dataset = defaultPitcherDataset("KBO");
  return createPitcherCareer({ league: "KBO", dataId: dataset.id, playerName: "규칙 테스트", teamId: "SAM", throws: "R", debutYear: 2026, rotationSlot: 1, targetEra: 2.8, seed }, dataset);
}
const runner = (name: string): Runner => ({ id: name, name, earned: true, responsibleUser: true });
function lowEra(outs = 324, earnedRuns = 24, targetEra = 2.5) {
  const state = career();
  state.stats.outs = outs;
  state.stats.earnedRuns = earnedRuns;
  state.stats.runs = earnedRuns;
  state.config.targetEra = targetEra;
  return state;
}
function strikeouts(state: PitcherState, count: number) {
  for (let i = 0; i < count; i++) state = applyPitchChoice(state, "K");
  return state;
}

describe("최저 방어율과 강제 홈런", () => {
  it("100.0이닝은 허용하고 100.1이닝부터 검사한다", () => {
    const state = lowEra(300, 0, .5);
    expect(forcedHomeRunRemaining(state)).toBe(0);
    const next = applyPitchChoice(state, "K");
    expect(forcedHomeRunRemaining(next)).toBe(3);
    expect(next.eraRestriction?.remaining).toBe(3);
  });
  it("목표보다 정확히 0.50 낮으면 발동하고 0.499 낮으면 발동하지 않는다", () => {
    expect(forcedHomeRunRemaining(lowEra(324, 24, 2.5))).toBe(3);
    expect(forcedHomeRunRemaining(lowEra(324, 24, 2.499))).toBe(0);
  });
  it("다른 모든 결과와 교체를 막고 정확히 세 번의 HR 이후 해제한다", () => {
    let state = lowEra(324, 24, 2.5);
    state.game!.bases = [runner("1루"), null, null];
    for (const choice of Object.keys(choiceLabels) as PitchChoice[]) {
      expect(Boolean(disabledReason(state, choice))).toBe(choice !== "HR");
      if (choice !== "HR") expect(() => applyPitchChoice(state, choice)).toThrow();
    }
    expect(() => relievePitcher(state)).toThrow(/강제 홈런/);
    for (const remaining of [2, 1, 0]) {
      state = applyPitchChoice(state, "HR");
      expect(forcedHomeRunRemaining(state)).toBe(remaining);
    }
    expect(state.game!.stats.homeRuns).toBe(3);
    expect(disabledReason(state, "K")).toBeNull();
    expect(state.eraRestriction?.cooldownFixtureId).toBe(state.game!.fixture.id);
  });
  it("첫 홈런으로 목표 범위에 돌아와도 남은 두 번을 선택해야 한다", () => {
    const state = applyPitchChoice(lowEra(301, 0, .5), "HR");
    expect(state.game!.stats.earnedRuns).toBe(1);
    expect(forcedHomeRunRemaining(state)).toBe(2);
    expect(() => applyPitchChoice(state, "K")).toThrow();
  });
  it("끝내기로 등판이 종료되어도 남은 홈런 횟수는 다음 등판에 이어진다", () => {
    let state = lowEra();
    const game = state.game!;
    const opponent = game.fixture.home === state.config.teamId ? game.fixture.away : game.fixture.home;
    game.fixture = { ...game.fixture, away: state.config.teamId, home: opponent };
    game.inning = 9; game.half = "BOTTOM";
    state = applyPitchChoice(state, "HR");
    expect(state.game!.phase).toBe("FINISHED");
    expect(state.eraRestriction?.remaining).toBe(2);
    state = nextPitcherStart(state);
    expect(forcedHomeRunRemaining(state)).toBe(2);
    expect(state.game!.streaks).toEqual({ strikeouts: 0, outBatters: 0 });
  });
  it("재로드 후에도 남은 횟수를 유지하고 손상된 횟수는 거부한다", () => {
    const state = applyPitchChoice(career(), "HR");
    state.eraRestriction = { remaining: 2 };
    const loaded = parsePitcherSave(JSON.stringify(state));
    expect(forcedHomeRunRemaining(loaded)).toBe(2);
    expect(applyPitchChoice(loaded, "HR").eraRestriction?.remaining).toBe(1);
    state.eraRestriction.remaining = 4;
    expect(() => parsePitcherSave(JSON.stringify(state))).toThrow();
  });
});

describe("연속 삼진·아웃 타자", () => {
  it("이닝이 바뀌어도 연속 K와 아웃을 유지한다", () => {
    const state = strikeouts(career(), 4);
    expect(state.game!.inning).toBe(2);
    expect(state.game!.streaks).toEqual({ strikeouts: 4, outBatters: 4 });
  });
  it("범타는 K만 끊고 안타·볼넷은 두 기록을 모두 끊는다", () => {
    const state = applyPitchChoice(strikeouts(career(), 2), "OUT");
    expect(state.game!.streaks).toEqual({ strikeouts: 0, outBatters: 3 });
    for (const choice of ["1B", "2B", "3B", "HR", "BB", "IBB", "HBP"] as PitchChoice[]) {
      expect(applyPitchChoice(state, choice).game!.streaks).toEqual({ strikeouts: 0, outBatters: 0 });
    }
  });
  it("타석을 끝내지 않는 도루와 폭투는 연속 기록에 영향을 주지 않는다", () => {
    let state = strikeouts(career(), 2);
    state.game!.bases = [runner("1루"), null, null];
    state = applyPitchChoice(applyPitchChoice(state, "SB"), "WP");
    expect(state.game!.streaks).toEqual({ strikeouts: 2, outBatters: 2 });
    expect(state.game!.stats.battersFaced).toBe(2);
  });
  it("희생번트는 아웃 타자를 한 명 늘리고 삼진 기록은 끊는다", () => {
    const state = strikeouts(career(), 1);
    state.game!.bases = [runner("1루"), null, null];
    expect(applyPitchChoice(state, "SH").game!.streaks).toEqual({ strikeouts: 0, outBatters: 2 });
  });
  it("병살의 두 아웃은 아웃 타자 한 명으로 센다", () => {
    let doublePlay: PitcherState | undefined;
    for (let seed = 1; seed <= 50; seed++) {
      const state = career(seed);
      state.game!.bases = [runner("1루"), null, null];
      const next = applyPitchChoice(state, "OUT");
      if (next.game!.stats.outs === 2) { doublePlay = next; break; }
    }
    expect(doublePlay).toBeDefined();
    expect(doublePlay!.game!.streaks).toEqual({ strikeouts: 0, outBatters: 1 });
  });
  it("예전 세이브는 기존 중계에서 연속 기록을 복원한다", () => {
    const state = applyPitchChoice(strikeouts(career(), 2), "OUT");
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.game.streaks;
    delete legacy.game.focusLogId;
    for (const entry of legacy.game.log) {
      delete entry.outcome; delete entry.important; delete entry.runsScored; delete entry.teamId;
    }
    expect(parsePitcherSave(JSON.stringify(legacy)).game!.streaks).toEqual({ strikeouts: 0, outBatters: 3 });
  });
});

describe("문자중계와 화면 알림", () => {
  it("만루 홈런의 점수·득점 선수·빨간 강조·팝업을 정확히 남긴다", () => {
    const before = career();
    before.game!.bases = [runner("1루 선수"), runner("2루 선수"), runner("3루 선수")];
    const after = applyPitchChoice(before, "HR");
    const entry = after.game!.log.find((item) => item.id === after.game!.focusLogId)!;
    expect(entry.runsScored).toBe(4);
    expect(entry.text).toContain("4점 홈런!");
    expect(entry.text).toContain("3루 선수 · 2루 선수 · 1루 선수");
    expect(gameLogEntryClasses({ ...entry, important: entry.important ?? false }, true)).toContain("scoring");
    expect(pitcherCelebrationsForTransition(before, after).map((item) => item.text)).toEqual(["4점 홈런 허용!"]);
    expect(after.game!.log.map((item) => item.id)).toEqual([...after.game!.log.map((item) => item.id)].sort((a, b) => a - b));
  });
  it("폭투 득점도 빨간 강조와 실점 팝업으로 표시한다", () => {
    const before = career(); before.game!.bases = [null, null, runner("3루 선수")];
    const after = applyPitchChoice(before, "WP");
    const entry = after.game!.log.at(-1)!;
    expect(entry.text).toContain("1점 득점!");
    expect(gameLogEntryClasses({ ...entry, important: entry.important ?? false })).toContain("scoring");
    expect(pitcherCelebrationsForTransition(before, after)[0].text).toBe("1점 실점!");
  });
  it("QS와 QS+는 6·7이닝 경계에서 한 번씩 표시한다", () => {
    const fiveTwo = strikeouts(career(), 17);
    const six = applyPitchChoice(fiveTwo, "K");
    expect(pitcherCelebrationsForTransition(fiveTwo, six).map((item) => item.label)).toEqual(["QUALITY START"]);
    const sixTwo = strikeouts(six, 2);
    const seven = applyPitchChoice(sixTwo, "K");
    expect(pitcherCelebrationsForTransition(sixTwo, seven).map((item) => item.label)).toEqual(["QUALITY START PLUS"]);
    expect(pitcherCelebrationsForTransition(seven, applyPitchChoice(seven, "K"))).toEqual([]);
    expect(gameAchievementLabels(seven.game!)).toEqual(["QS", "QS+"]);
  });
  it("QS는 자책점이 아니라 총 실점으로 판단한다", () => {
    const state = career(); state.game!.stats.outs = 21;
    state.game!.stats.runs = 3; state.game!.stats.earnedRuns = 0;
    expect(qualityStartConditions(state.game!)).toEqual({ qs: true, qsPlus: true });
    state.game!.stats.runs = 4;
    expect(qualityStartConditions(state.game!)).toEqual({ qs: false, qsPlus: false });
  });
  it("퍼펙트·노히트노런·완봉승은 종료 때 표시하고 불러오기로 재생하지 않는다", () => {
    let state = career();
    state.game!.score[state.config.teamId] = 100;
    state.game!.goAhead = { team: state.config.teamId, winUser: true, lossUser: false };
    state = strikeouts(state, 26);
    expect(gameAchievementLabels(state.game!)).toEqual(["QS", "QS+"]);
    const finished = applyPitchChoice(state, "K");
    expect(pitcherCelebrationsForTransition(state, finished).map((item) => item.label)).toEqual(["PERFECT GAME", "NO-HITTER", "SHUTOUT WIN"]);
    expect(gameAchievementLabels(finished.game!)).toEqual(["퍼펙트게임", "노히트노런", "완봉승", "QS", "QS+"]);
    expect(pitcherCelebrationsForTransition(finished, structuredClone(finished))).toEqual([]);
    expect(pitcherCelebrationsForTransition(finished, nextPitcherStart(finished))).toEqual([]);
  });
  it("노히트여도 실점하면 노히트노런이 아니며 무승부는 완봉승이 아니다", () => {
    const state = career();
    state.game!.phase = "FINISHED";
    state.game!.stats.noHitters = 1; state.game!.stats.runs = 1;
    state.game!.stats.shutouts = 1; state.game!.decision = "ND";
    expect(gameAchievementLabels(state.game!)).toEqual([]);
  });
});
