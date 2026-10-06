import { describe, expect, it } from "vitest";
import { formatTeamStreak } from "../../engine/milestones";
import { pitcherTeamStreaks } from "../standings";
import type { PitchResult } from "../types";

function result(home: string, away: string, homeScore: number, awayScore: number, controlled = false): PitchResult {
  return { fixture: { id: `${home}-${away}`, day: 0, home, away }, homeScore, awayScore, controlled };
}

describe("Best Pitcher 팀 연승·연패", () => {
  it("홈·원정과 휴식일 경기를 모두 반영하고 승패가 바뀌면 새 연속 기록을 시작한다", () => {
    const games = [result("SAM", "KIA", 4, 1, true), result("KIA", "SAM", 0, 3), result("SAM", "KIA", 5, 2)];
    const streaks = pitcherTeamStreaks(games);
    expect(formatTeamStreak(streaks.SAM)).toBe("3연승");
    expect(formatTeamStreak(streaks.KIA)).toBe("3연패");
    games.push(result("KIA", "SAM", 3, 0));
    expect(pitcherTeamStreaks(games)).toEqual({ SAM: -1, KIA: 1 });
    games.push(result("SAM", "KIA", 0, 2));
    expect(pitcherTeamStreaks(games)).toEqual({ SAM: -2, KIA: 2 });
  });

  it("무승부는 연속 기록을 종료하고 다른 팀의 경기는 해당 팀의 연속 기록을 바꾸지 않는다", () => {
    const games = [result("SAM", "KIA", 4, 1), result("LG", "LOT", 2, 3), result("SAM", "KIA", 2, 2)];
    expect(pitcherTeamStreaks(games)).toEqual({ SAM: 0, KIA: 0, LG: -1, LOT: 1 });
    expect(formatTeamStreak(pitcherTeamStreaks(games).SAM)).toBe("–");
    games.push(result("KIA", "SAM", 0, 1));
    expect(pitcherTeamStreaks(games).SAM).toBe(1);
  });

  it("세이브의 완료 경기 결과로 복원하며 경기를 치르지 않은 팀은 연속 기록을 만들지 않는다", () => {
    expect(pitcherTeamStreaks([])).toEqual({});
    expect(formatTeamStreak(pitcherTeamStreaks([]).SAM)).toBe("–");
    const games = [result("BOS", "STL", 0, 4), result("STL", "BOS", 3, 1)];
    const savedResults = JSON.parse(JSON.stringify(games)) as PitchResult[];
    expect(pitcherTeamStreaks(savedResults)).toEqual({ BOS: -2, STL: 2 });
    expect(savedResults).toEqual(games);
  });
});
