import type { DaySchedule, GameFixture, TeamId } from "./types";
import { SeededRng } from "./rng";

function shuffled<T>(items: readonly T[], rng: SeededRng): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

// 9개의 라운드로빈 대진을 3·3·3·3·2·2연전으로 반복한다.
// 각 상대와 16경기, 홈/원정 8경기를 동시에 보장한다.
export function generateSchedule(teamIds: TeamId[], season = 2017, seed = season): DaySchedule[] {
  if (teamIds.length !== 10 || new Set(teamIds).size !== 10) throw new Error("KBO 일정은 정확히 10개 팀이 필요합니다.");
  // 경기 난수와 분리해 같은 연도·seed는 같은 일정을 재현합니다.
  const rng = new SeededRng(seed ^ Math.imul(season, 0x9e3779b1));
  const rotation = shuffled(teamIds, rng);
  const pairRounds: Array<Array<[TeamId, TeamId]>> = [];

  for (let round = 0; round < teamIds.length - 1; round += 1) {
    const pairs: Array<[TeamId, TeamId]> = [];
    for (let i = 0; i < teamIds.length / 2; i += 1) {
      const left = rotation[i];
      const right = rotation[teamIds.length - 1 - i];
      pairs.push(round % 2 === 0 ? [left, right] : [right, left]);
    }
    pairRounds.push(pairs);
    rotation.splice(1, 0, rotation.pop()!);
  }

  const blockLengths = [3, 3, 3, 3, 2, 2];
  const days: DaySchedule[] = [];
  let day = 0;
  let series = 0;
  let lastRound = -1;

  blockLengths.forEach((seriesLength, blockIndex) => {
    const order = shuffled(pairRounds.map((_, index) => index), rng);
    // 블록 경계에서 같은 상대와 바로 다시 만나 긴 연전이 되는 것을 방지합니다.
    if (order[0] === lastRound) [order[0], order[1]] = [order[1], order[0]];
    order.forEach((roundIndex) => {
      const pairs = pairRounds[roundIndex];
      lastRound = roundIndex;
      series += 1;
      for (let gameInSeries = 1; gameInSeries <= seriesLength; gameInSeries += 1) {
        const games: GameFixture[] = pairs.map(([baseHome, baseAway], pairIndex) => {
          const home = blockIndex % 2 === 0 ? baseHome : baseAway;
          const away = blockIndex % 2 === 0 ? baseAway : baseHome;
          return {
            id: `${season}-${day + 1}-${pairIndex + 1}`,
            day,
            series,
            gameInSeries,
            seriesLength,
            home,
            away,
          };
        });
        days.push({ day, games });
        day += 1;
      }
    });
  });

  return days;
}
