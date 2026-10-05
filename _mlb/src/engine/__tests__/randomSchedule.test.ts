import { describe, expect, it, vi } from "vitest";
import { supportedTeamIds, getBuiltInLeagueDataset } from "../../data/leagueDataset";
import { createNewSeason, startNextSeason, validateSave } from "../gameEngine";
import { generateSchedule } from "../schedule";
import { newCareerSeed } from "../rng";

const sequence = (season: number, seed: number) => generateSchedule(supportedTeamIds, season, seed).flatMap(day => day.games).map(game => game.away + ":" + game.home);
describe("시즌별 무작위 일정", () => {
  it("BOS의 개막 상대와 마지막 상대도 seed·시즌에 따라 달라진다", () => {
    const first = new Set<string>(), last = new Set<string>();
    for (const season of [2025, 2026]) for (const seed of [1, 19, 81, 2026, 375]) {
      const games = generateSchedule(supportedTeamIds, season, seed).flatMap(day => day.games)
        .filter(game => game.home === "BOS" || game.away === "BOS");
      const opponent = (game: typeof games[number]) => game.home === "BOS" ? game.away : game.home;
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
          expect(own.length).toBeLessThanOrEqual(2);
          expect(own.every(game => game.home !== game.away)).toBe(true);
        }
      }
      for (const team of supportedTeamIds) {
        expect(games.filter(game => game.home === team)).toHaveLength(81);
        expect(games.filter(game => game.away === team)).toHaveLength(81);
      }
    }
  });
});

it("MLB는 모든 상대별 대진 횟수와 날짜 범위를 공식 스냅샷 그대로 유지한다", () => {
  const original = generateSchedule(supportedTeamIds, 2025, null);
  const counts = (days: ReturnType<typeof generateSchedule>) => {
    const pairs: Record<string,number> = {};
    for (const game of days.flatMap(day => day.games)) {const key = game.away+":"+game.home; pairs[key]=(pairs[key]??0)+1;}
    return pairs;
  };
  for (const seed of [1,19,81]) {
    const random = generateSchedule(supportedTeamIds, 2025, seed);
    expect(counts(random)).toEqual(counts(original));
    expect(random.map(day => day.games[0].date)).toEqual(original.map(day => day.games[0].date));
    for (const team of supportedTeamIds) {
      const fixtures = random.flatMap(day => day.games).filter(game => game.home===team || game.away===team);
      const before = original.flatMap(day => day.games).filter(game => game.home===team || game.away===team);
      const series: Array<typeof before> = [];
      for (const game of before) {
        const current = series.at(-1), previous = current?.at(-1);
        if (!previous || game.gameInSeries === 1 || previous.home !== game.home || previous.away !== game.away) series.push([game]);
        else current!.push(game);
      }
      // 공식 원본은 일부 더블헤더의 경기 번호가 2→4→3 순서로 저장됩니다.
      // 번호 증가를 가정하지 않고 원래 연전의 경기 ID 순서가 유지되는지 검사합니다.
      for (const originalSeries of series) {
        const start = fixtures.findIndex(game => game.id === originalSeries[0].id);
        expect(fixtures.slice(start,start+originalSeries.length).map(game=>game.id)).toEqual(originalSeries.map(game=>game.id));
      }
    }
  }
});
