import { describe, expect, it, vi } from "vitest";
import { attemptSteal } from "../baserunning";
import { createExampleSave, maybeAutoSteal, resolveUserSteal } from "../gameEngine";
import { SeededRng } from "../rng";
import type { Baserunner } from "../types";

const user = (speed = 76): Baserunner => ({ playerId: "USER-PLAYER", name: "도루 검증", teamId: "SAM", speed, isUser: true });

describe("고정 확률 도루", () => {
  it("주자 속도와 직전 결과에 관계없이 매번 입력한 75% 경계로 판정한다", () => {
    for (const speed of [0, 50, 100]) {
      const rng = new SeededRng(1);
      const next = vi.spyOn(rng, "next")
        .mockReturnValueOnce(0.749999).mockReturnValueOnce(0.75)
        .mockReturnValueOnce(0.2).mockReturnValueOnce(0.9);
      const bases: [Baserunner, null, null] = [user(speed), null, null];
      expect(Array.from({ length: 4 }, () => attemptSteal(bases, rng, 0.75).success))
        .toEqual([true, false, true, false]);
      expect(next).toHaveBeenCalledTimes(4);
    }
  });

  it("도루할 주자가 없거나 2루가 차 있으면 난수를 소비하지 않는다", () => {
    const rng = new SeededRng(1);
    const chance = vi.spyOn(rng, "chance");
    expect(attemptSteal([null, null, null], rng, 0.75).outsAdded).toBe(0);
    const bases: [Baserunner, Baserunner, null] = [user(), { ...user(), playerId: "SAM-BYH", isUser: false }, null];
    expect(attemptSteal(bases, rng, 0.75)).toEqual({ success: false, bases, outsAdded: 0 });
    expect(chance).not.toHaveBeenCalled();
  });

  it("실제 사용자 경로도 상대 투수·주자 능력과 누적 성적에 영향받지 않는다", () => {
    const chance = vi.spyOn(SeededRng.prototype, "chance");
    try {
      for (const control of [0, 100]) {
        for (const speed of [0, 100]) {
          for (const previousSuccesses of [0, 30]) {
            for (const roll of [0.749999, 0.75]) {
              const state = createExampleSave();
              state.config.stealSuccess = 0.75;
              state.game!.phase = "WAITING_FOR_STEAL";
              state.game!.outs = 0;
              state.game!.bases = [user(speed), null, null];
              state.leagueData.teams.DOO.pitchers.find((p) => p.id === "DOO-NIP")!.control = control;
              const stats = state.playerStats["USER-PLAYER"];
              stats.sb = previousSuccesses;
              stats.cs = 30 - previousSuccesses;
              const next = vi.spyOn(SeededRng.prototype, "next").mockReturnValue(roll);
              chance.mockClear();
              const result = resolveUserSteal(state, true);
              next.mockRestore();
              expect(chance).toHaveBeenCalledTimes(1);
              expect(chance).toHaveBeenCalledWith(0.75);
              expect(result.playerStats["USER-PLAYER"].sb - stats.sb).toBe(roll < 0.75 ? 1 : 0);
              expect(result.playerStats["USER-PLAYER"].cs - stats.cs).toBe(roll < 0.75 ? 0 : 1);
              expect(result.game!.userGameStats.sb - state.game!.userGameStats.sb).toBe(roll < 0.75 ? 1 : 0);
              expect(result.game!.userGameStats.cs - state.game!.userGameStats.cs).toBe(roll < 0.75 ? 0 : 1);
            }
          }
        }
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("자동 도루도 주루 등급별 최종 성공률을 추가 보정 없이 사용한다", () => {
    for (const [grade, probability] of [[7, 0.72], [8, 0.78], [9, 0.84], [10, 0.90]]) {
      const state = createExampleSave();
      const profile = state.leagueData.teams.SAM.hitters.find((h) => h.id === "SAM-BYH")!;
      profile.statProfile = { games: 144, avg: 0.3, homeRuns: 5, speed: grade };
      const runner: Baserunner = { playerId: profile.id, name: profile.name, teamId: "SAM", speed: 95, isUser: false };
      state.game!.bases = [runner, null, null];
      state.game!.outs = 0;
      state.playerStats[runner.playerId].sb = 0;
      state.playerStats[runner.playerId].cs = 0;
      const rng = new SeededRng(1);
      const chance = vi.spyOn(rng, "chance").mockReturnValue(true);
      maybeAutoSteal(state, state.game!, rng);
      expect(chance).toHaveBeenCalledTimes(2);
      expect(chance).toHaveBeenNthCalledWith(2, probability);
      expect(state.playerStats[runner.playerId].sb).toBe(1);
    }
  });
});
