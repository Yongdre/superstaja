import { describe, expect, it } from "vitest";
import { supportedTeamIds } from "../../data/leagueDataset";
import { generateSchedule } from "../schedule";

describe("KBO 정규시즌 일정", () => {
  const schedule = generateSchedule(supportedTeamIds);

  it("팀당 144경기를 편성한다", () => {
    expect(schedule).toHaveLength(144);
    for (const team of supportedTeamIds) {
      const games = schedule.flatMap((day) => day.games).filter((game) => game.home === team || game.away === team);
      expect(games).toHaveLength(144);
    }
  });

  it("상대별 16경기와 홈/원정 8경기를 보장한다", () => {
    const games = schedule.flatMap((day) => day.games);
    for (let i = 0; i < supportedTeamIds.length; i += 1) {
      for (let j = i + 1; j < supportedTeamIds.length; j += 1) {
        const a = supportedTeamIds[i];
        const b = supportedTeamIds[j];
        const meetings = games.filter((game) => [game.home, game.away].includes(a) && [game.home, game.away].includes(b));
        expect(meetings).toHaveLength(16);
        expect(meetings.filter((game) => game.home === a)).toHaveLength(8);
        expect(meetings.filter((game) => game.home === b)).toHaveLength(8);
      }
    }
  });

  it("모든 경기일에 10개 팀이 한 번씩 경기한다", () => {
    schedule.forEach((day) => {
      expect(day.games).toHaveLength(5);
      expect(new Set(day.games.flatMap((game) => [game.home, game.away])).size).toBe(10);
    });
  });
});
