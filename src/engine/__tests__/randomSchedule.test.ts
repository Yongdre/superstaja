import { describe, expect, it, vi } from "vitest";
import { supportedTeamIds, getBuiltInLeagueDataset } from "../../data/leagueDataset";
import { createNewSeason, startNextSeason, validateSave } from "../gameEngine";
import { generateSchedule } from "../schedule";
import { newCareerSeed } from "../rng";

const sequence = (season: number, seed: number) => generateSchedule(supportedTeamIds, season, seed).flatMap(day => day.games).map(game => game.away + ":" + game.home);
describe("시즌별 무작위 일정", () => {
  it("SAM의 개막 상대와 마지막 상대도 seed·시즌에 따라 달라진다", () => {
    const first = new Set<string>(), last = new Set<string>();
    for (const season of [2025, 2026]) for (const seed of [1, 19, 81, 2026, 375]) {
      const games = generateSchedule(supportedTeamIds, season, seed).flatMap(day => day.games)
        .filter(game => game.home === "SAM" || game.away === "SAM");
      const opponent = (game: typeof games[number]) => game.home === "SAM" ? game.away : game.home;
      first.add(opponent(games[0]));
      last.add(opponent(games[games.length - 1]));
    }
    expect(first.size).toBeGreaterThan(1);
    expect(last.size).toBeGreaterThan(1);
  });
  it("새 커리어마다 seed를 생성하며 0은 안전한 값으로 바꾼다", () => {
    const random = vi.spyOn(crypto, "getRandomValues")
      .mockReturnValueOnce(new Uint32Array([31]))
      .mockReturnValueOnce(new Uint32Array([82]))
      .mockReturnValueOnce(new Uint32Array([0]));
    try {
      expect(newCareerSeed()).toBe(31);
      expect(newCareerSeed()).toBe(82);
      expect(newCareerSeed()).toBe(1);
    } finally { random.mockRestore(); }
  });
  it("같은 seed와 시즌은 재현되고 다른 seed·시즌은 상대 순서가 달라진다", () => {
    expect(generateSchedule(supportedTeamIds, 2025, 19)).toEqual(generateSchedule(supportedTeamIds, 2025, 19));
    expect(sequence(2025, 19)).not.toEqual(sequence(2025, 81));
    expect(sequence(2025, 19)).not.toEqual(sequence(2026, 19));
  });
  it("저장된 일정은 불러오기에 유지되고 새 시즌에서만 다시 생성한다", () => {
    const state = createNewSeason({debutYear: 2025, seed: 19});
    const restored = validateSave(JSON.parse(JSON.stringify(state)));
    expect(restored.schedule).toEqual(state.schedule);
    restored.game!.phase = "SEASON_END";
    const next = startNextSeason(restored, {...restored.config});
    expect(next.schedule).toEqual(generateSchedule(supportedTeamIds, 2026, 19));
    expect(sequence(2025, 19)).not.toEqual(sequence(2026, 19));
  });
  it("여러 seed에서도 경기 ID·홈 원정·하루 편성이 올바르다", () => {
    for (const seed of [1, 19, 81, 2026]) {
      const schedule = generateSchedule(supportedTeamIds, 2025, seed);
      const games = schedule.flatMap(day => day.games);
      expect(new Set(games.map(game => game.id)).size).toBe(games.length);
      for (const day of schedule) {
        for (const game of day.games) expect(game.day).toBe(day.day);
        for (const team of supportedTeamIds) {
          const own = day.games.filter(game => game.away === team || game.home === team);
          expect(own.length).toBeLessThanOrEqual(1);
          expect(own.every(game => game.home !== game.away)).toBe(true);
        }
      }
      for (const team of supportedTeamIds) {
        expect(games.filter(game => game.home === team)).toHaveLength(72);
        expect(games.filter(game => game.away === team)).toHaveLength(72);
      }
    }
  });
});

it("2022~2025 KBO 데이터가 새 시즌 목록에 등록되고 타격을 진행할 수 있다", () => {
  for (const year of [2022, 2023, 2024, 2025]) {
    const dataset = getBuiltInLeagueDataset(year);
    expect(dataset?.sourceSeason).toBe(year);
    const state = createNewSeason({debutYear: year}, dataset!);
    expect(state.game!.phase).toBe("USER_AT_BAT");
    expect(state.leagueData).toEqual(dataset);
  }
});
it("KBO는 연전 길이와 상대별 홈·원정 8경기를 모든 seed에서 유지한다", () => {
  for (const seed of [1,19,81]) {
    const schedule = generateSchedule(supportedTeamIds, 2025, seed);
    const games = schedule.flatMap(day => day.games);
    for (const team of supportedTeamIds) for (const opponent of supportedTeamIds.filter(id => id !== team)) {
      expect(games.filter(game => game.home === team && game.away === opponent)).toHaveLength(8);
    }
    for (const team of supportedTeamIds) {
      const own = games.filter(game => game.home === team || game.away === team);
      for (let index = 0; index < own.length; index++) {
        const game = own[index];
        if (game.gameInSeries < game.seriesLength) {
          expect(own[index+1]).toMatchObject({home: game.home, away: game.away, series: game.series, gameInSeries: game.gameInSeries+1});
        } else if (index+1 < own.length) {
          const next = own[index+1];
          expect(next.home === game.home && next.away === game.away).toBe(false);
          expect(next.home === game.away && next.away === game.home).toBe(false);
        }
      }
    }
  }
});
