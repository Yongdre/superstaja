import { describe, expect, it, vi } from "vitest";
import { defaultLeagueDataset } from "../../data/leagueDataset";
import { advanceOnForcedWalk, advanceOnHomeRun, attemptSteal, automaticStealPlan } from "../baserunning";
import { createExampleSave, maybeAutoSteal } from "../gameEngine";
import { canChooseSacrifice, resolvePlateAppearance } from "../plateAppearance";
import { avg, obp } from "../statistics";
import { SeededRng } from "../rng";
import type { Baserunner, SeasonState, UserChoice } from "../types";

const user = (): Baserunner => ({ playerId: "USER-PLAYER", name: "이용호", teamId: "SAM", speed: 76, isUser: true });
const runner = (id: string, name: string): Baserunner => ({ playerId: id, name, teamId: "SAM", speed: 70, isUser: false });

function resolveForced(state: SeasonState, choice: UserChoice, seed = 17) {
  return resolvePlateAppearance({
    game: state.game!, batter: { id: "USER-PLAYER", name: "이용호", position: "2B", bats: "R", contact: 70, power: 68, discipline: 66, speed: 76 },
    pitcher: defaultLeagueDataset.teams.DOO.pitchers.find((pitcher) => pitcher.id === "DOO-NIP")!, battingTeam: "SAM", stats: state.playerStats, rng: new SeededRng(seed), userChoice: choice,
  });
}

describe("주자 진루", () => {
  it("홈런이면 모든 주자와 타자가 득점한다", () => {
    const bases: [Baserunner, Baserunner, Baserunner] = [runner("SAM-BYH", "박해민"), runner("SAM-KJW", "구자욱"), runner("SAM-RUF", "러프")];
    const result = advanceOnHomeRun(bases, user());
    expect(result.scored).toHaveLength(4);
    expect(result.bases).toEqual([null, null, null]);
  });

  it("만루 볼넷과 몸에 맞는 공은 1점을 낸다", () => {
    const bases: [Baserunner, Baserunner, Baserunner] = [runner("SAM-BYH", "박해민"), runner("SAM-KJW", "구자욱"), runner("SAM-RUF", "러프")];
    const result = advanceOnForcedWalk(bases, user());
    expect(result.scored.map((item) => item.name)).toEqual(["러프"]);
    expect(result.bases.every(Boolean)).toBe(true);

    for (const choice of ["BB", "HBP"] as const) {
      const state = createExampleSave();
      state.game!.bases = bases;
      const before = state.game!.score.SAM;
      resolveForced(state, choice);
      expect(state.game!.score.SAM).toBe(before + 1);
      expect(state.playerStats["USER-PLAYER"].ab).toBe(170);
    }
  });

  it("IBB는 BB와 IBB에 함께 기록되고 AB는 늘지 않는다", () => {
    const state = createExampleSave();
    resolveForced(state, "IBB");
    expect(state.playerStats["USER-PLAYER"].bb).toBe(23);
    expect(state.playerStats["USER-PLAYER"].ibb).toBe(2);
    expect(state.playerStats["USER-PLAYER"].ab).toBe(170);
  });

  it("강제 HR 선택의 안타 기록은 주루 결과와 무관하게 유지된다", () => {
    const state = createExampleSave();
    state.game!.bases = [runner("SAM-BYH", "박해민"), runner("SAM-KJW", "구자욱"), runner("SAM-RUF", "러프")];
    resolveForced(state, "HR");
    expect(state.playerStats["USER-PLAYER"].hr).toBe(15);
    expect(state.playerStats["USER-PLAYER"].h).toBe(54);
    expect(state.playerStats["USER-PLAYER"].rbi).toBe(63);
    expect(state.game!.score.SAM).toBe(7);
  });
});

describe("NO HIT 세부 결과", () => {
  function findOutcome(target: "GIDP" | "SF" | "ROE") {
    for (let seed = 1; seed < 20000; seed += 1) {
      const state = createExampleSave();
      state.game!.outs = 0;
      state.game!.bases = target === "SF" ? [null, null, runner("SAM-BYH", "박해민")] : target === "GIDP" ? [runner("SAM-BYH", "박해민"), null, null] : [null, null, null];
      const result = resolveForced(state, "OUT", seed);
      if (result.outcome === target) return state;
    }
    throw new Error(`${target} 결과를 만들 seed를 찾지 못했습니다.`);
  }

  it("병살은 아웃 두 개와 GIDP를 기록한다", () => {
    const state = findOutcome("GIDP");
    expect(state.game!.outs).toBe(2);
    expect(state.playerStats["USER-PLAYER"].gidp).toBe(1);
  });

  it("희생플라이는 SF를 기록하고 AB를 늘리지 않는다", () => {
    const state = findOutcome("SF");
    expect(state.playerStats["USER-PLAYER"].sf).toBe(1);
    expect(state.playerStats["USER-PLAYER"].ab).toBe(170);
    expect(state.game!.score.SAM).toBe(4);
  });

  it("실책 출루는 안타가 아니며 ROE와 AB를 기록한다", () => {
    const state = findOutcome("ROE");
    expect(state.playerStats["USER-PLAYER"].h).toBe(53);
    expect(state.playerStats["USER-PLAYER"].roe).toBe(1);
    expect(state.playerStats["USER-PLAYER"].ab).toBe(171);
  });
});

describe("희생타 결과 선택", () => {
  it("희생번트는 주자를 한 베이스씩 진루시키고 타율과 출루율을 유지한다", () => {
    const state = createExampleSave();
    const game = state.game!;
    game.outs = 1;
    game.bases = [runner("SAM-BYH", "박해민"), runner("SAM-KJW", "구자욱"), null];
    const before = { ...state.playerStats["USER-PLAYER"] };
    const result = resolveForced(state, "SH");
    const stats = state.playerStats["USER-PLAYER"];
    expect(result.outcome).toBe("SH");
    expect(game.outs).toBe(2);
    expect(game.bases.map((r) => r?.name ?? null)).toEqual([null, "박해민", "구자욱"]);
    expect(stats.pa).toBe(before.pa + 1);
    expect(stats.ab).toBe(before.ab);
    expect(stats.sh).toBe(1);
    expect(game.userGameStats.sh).toBe(1);
    expect(stats.rbi).toBe(before.rbi);
    expect(avg(stats)).toBe(avg(before));
    expect(obp(stats)).toBe(obp(before));
  });

  it("희생플라이 선택은 3루 주자를 득점시키고 타수 없이 타점과 SF를 기록한다", () => {
    const state = createExampleSave();
    state.game!.outs = 1;
    state.game!.bases = [null, null, runner("SAM-BYH", "박해민")];
    const before = { ...state.playerStats["USER-PLAYER"] };
    expect(resolveForced(state, "SF").outcome).toBe("SF");
    const stats = state.playerStats["USER-PLAYER"];
    expect(stats).toMatchObject({ pa: before.pa + 1, ab: before.ab, sf: 1, rbi: before.rbi + 1 });
    expect(state.game!.outs).toBe(2);
    expect(state.game!.score.SAM).toBe(4);
    expect(avg(stats)).toBe(avg(before));
    expect(obp(stats)).toBeLessThan(obp(before));
  });

  it("2사 또는 필요한 주자가 없는 희생타는 상태를 바꾸지 않고 거부한다", () => {
    for (const choice of ["SF", "SH"] as const) {
      const state = createExampleSave();
      state.game!.outs = 2;
      state.game!.bases = [runner("SAM-BYH", "박해민"), null, runner("SAM-KJW", "구자욱")];
      const before = structuredClone(state);
      expect(canChooseSacrifice(state.game!, choice)).toBe(false);
      expect(() => resolveForced(state, choice)).toThrow(/희생타/);
      expect(state).toEqual(before);
      state.game!.outs = 0;
      state.game!.bases = [null, null, null];
      expect(canChooseSacrifice(state.game!, choice)).toBe(false);
    }
  });

  it("자동 타자도 후반 접전에서 희생번트로 진루시킬 수 있다", () => {
    const state = createExampleSave();
    const rng = new SeededRng(1);
    vi.spyOn(rng, "chance").mockReturnValue(true);
    state.game!.inning = 7;
    state.game!.outs = 0;
    state.game!.score.DOO = state.game!.score.SAM;
    state.game!.bases = [runner("SAM-BYH", "박해민"), null, null];
    const batter = { ...defaultLeagueDataset.teams.SAM.hitters[1], power: 40 };
    const result = resolvePlateAppearance({ game: state.game!, batter, pitcher: defaultLeagueDataset.teams.DOO.pitchers[0], battingTeam: "SAM", stats: state.playerStats, rng });
    expect(result.outcome).toBe("SH");
    expect(state.playerStats[batter.id].sh).toBe(1);
    expect(state.game!.bases[1]?.name).toBe("박해민");
  });
});

describe("도루", () => {
  it("주루 등급별 자동 도루 성공률과 시즌 최대 시도 수를 반환한다", () => {
    expect(automaticStealPlan(6)).toBeUndefined();
    expect(automaticStealPlan(7)).toMatchObject({ successProbability: 0.72, maxAttempts: 30 });
    expect(automaticStealPlan(8)).toMatchObject({ successProbability: 0.78, maxAttempts: 40 });
    expect(automaticStealPlan(9)).toMatchObject({ successProbability: 0.84, maxAttempts: 50 });
    expect(automaticStealPlan(10)).toMatchObject({ successProbability: 0.90, maxAttempts: 60 });
  });

  it("시즌 최대 도루 시도 수에 도달한 선수는 더 시도하지 않는다", () => {
    const state = createExampleSave();
    const fastRunner: Baserunner = { playerId: "SAM-BYH", name: "박해민", teamId: "SAM", speed: 95, isUser: false };
    state.game!.bases = [fastRunner, null, null];
    state.game!.outs = 0;
    state.playerStats[fastRunner.playerId].sb = 48;
    state.playerStats[fastRunner.playerId].cs = 12;

    maybeAutoSteal(state, state.game!, new SeededRng(1));

    expect(state.game!.bases[0]?.playerId).toBe(fastRunner.playerId);
    expect(state.playerStats[fastRunner.playerId].sb + state.playerStats[fastRunner.playerId].cs).toBe(60);
  });

  it("성공 시 1루 주자가 2루로 이동한다", () => {
    const bases: [Baserunner, null, null] = [user(), null, null];
    let result = attemptSteal(bases, new SeededRng(1), 0.95);
    for (let seed = 2; !result.success && seed < 100; seed += 1) result = attemptSteal(bases, new SeededRng(seed), 0.95);
    expect(result.success).toBe(true);
    expect(result.bases[1]?.isUser).toBe(true);
  });

  it("실패 시 주자가 사라지고 아웃이 하나 늘어난다", () => {
    const bases: [Baserunner, null, null] = [user(), null, null];
    let result = attemptSteal(bases, new SeededRng(1), 0.25);
    for (let seed = 2; result.success && seed < 100; seed += 1) result = attemptSteal(bases, new SeededRng(seed), 0.25);
    expect(result.success).toBe(false);
    expect(result.outsAdded).toBe(1);
    expect(result.bases[0]).toBeNull();
  });
});
