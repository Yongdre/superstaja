import raw from "../data/mlb-schedule-2026.json";
import teams from "../data/mlbTeams.json";
import type { DaySchedule, TeamId } from "./types";
import { SeededRng } from "./rng";

const byMlbId = new Map(teams.map(team => [team.mlbId, team.id as TeamId]));

/** 모든 팀의 원래 연전을 끊지 않는 지점에서 리그 전체 일정을 나눕니다. */
function scheduleBlocks(days: DaySchedule[]): DaySchedule[][] {
  const active = new Map<string, { start: number; end: number; gameNumber: number }>();
  const spans: Array<{ start: number; end: number; gameNumber: number }> = [];
  for (const day of days) for (const game of day.games) {
    const key = game.away + ":" + game.home;
    let span = active.get(key);
    if (!span || game.gameInSeries <= span.gameNumber) {
      span = { start: day.day, end: day.day, gameNumber: game.gameInSeries };
      active.set(key, span);
      spans.push(span);
    } else {
      span.end = day.day;
      span.gameNumber = game.gameInSeries;
    }
  }
  const blocks: DaySchedule[][] = [];
  let start = 0;
  for (let boundary = 1; boundary <= days.length; boundary++) {
    if (boundary < days.length && spans.some(span => span.start < boundary && span.end >= boundary)) continue;
    blocks.push(days.slice(start, boundary));
    start = boundary;
  }
  return blocks;
}

function randomizeBlocks(days: DaySchedule[], season: number, seed: number): DaySchedule[] {
  const blocks = scheduleBlocks(days);
  const rng = new SeededRng(seed ^ Math.imul(season, 0x9e3779b1));
  // 개막·최종 구간도 포함해 모든 묶음을 섞습니다. 원래 연전은 유지하지만
  // 실제 요일·이동 휴식 배치는 재현하지 않는 가상 일정입니다.
  const reordered = [...blocks];
  for (let index = reordered.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [reordered[index], reordered[other]] = [reordered[other], reordered[index]];
  }
  return reordered.flat().map((source, index) => {
    const destination = days[index];
    const date = destination.games[0].date!;
    return { day: destination.day, games: source.games.map(game => ({...game, day: destination.day, date})) };
  });
}

// 2026 공식 대진 횟수를 유지하는 가상 일정. seed=null은 진단용 원래 순서입니다.
export function generateSchedule(teamIds: TeamId[], season = 2026, seed: number | null = season): DaySchedule[] {
  if (teamIds.length !== 30 || teams.some(team => !teamIds.includes(team.id as TeamId))) throw new Error("MLB 30개 구단이 필요합니다.");
  const days = new Map<string, DaySchedule>();
  for (const row of raw.games) {
    const [gamePk, sourceDate, awayId, homeId, gameInSeries, seriesLength] = row;
    const date = String(sourceDate).replace("2026", String(season));
    if (!days.has(date)) days.set(date, {day: days.size, games: []});
    const day = days.get(date)!;
    day.games.push({id: `${season}-${gamePk}`, date, day: day.day, series: Number(gamePk),
      gameInSeries: Number(gameInSeries), seriesLength: Number(seriesLength),
      away: byMlbId.get(Number(awayId))!, home: byMlbId.get(Number(homeId))!});
  }
  const schedule = [...days.values()];
  return seed === null ? schedule : randomizeBlocks(schedule, season, seed);
}
