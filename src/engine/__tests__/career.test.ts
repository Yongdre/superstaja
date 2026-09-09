import { describe, expect, it } from "vitest";
import { careerStats } from "../career";
import { createNewSeason } from "../gameEngine";
import { emptyBatterStats } from "../statistics";

describe("커리어 통산 기록", () => {
  it("완료된 시즌과 현재 시즌 기록을 합산한다", () => {
    const state = createNewSeason({ debutYear: 2016 });
    state.career.seasons.push({
      season: 2015,
      teamId: "SAM",
      playerStats: { ...emptyBatterStats(), pa: 600, ab: 550, h: 170, hr: 25, rbi: 90 },
      teamRecord: { games: 144, wins: 80, losses: 63, ties: 1, runsFor: 700, runsAgainst: 620, homeGames: 72, awayGames: 72 },
      goals: { battingOrder: 2, targetAvgMin: 0.3, targetAvgMax: 0.31, homeRunCap: 30, enforceHomeRunCap: true, isFinalSeason: false },
    });
    state.playerStats["USER-PLAYER"] = { ...emptyBatterStats(), pa: 100, ab: 90, h: 30, hr: 5, rbi: 18 };
    const totals = careerStats(state);
    expect(totals.ab).toBe(640);
    expect(totals.h).toBe(200);
    expect(totals.hr).toBe(30);
    expect(totals.rbi).toBe(108);
  });
});
