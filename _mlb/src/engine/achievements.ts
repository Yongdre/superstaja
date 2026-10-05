import { careerStats } from "./career";
import type { BatterStats, CareerMilestone, GameState, SeasonState } from "./types";

type MilestoneRule = { stat: "h" | "hr" | "sb"; step: number; label: string };
export const careerMilestoneRules = [
  { stat: "h", step: 1000, label: "안타" },
  { stat: "hr", step: 100, label: "홈런" },
] as const satisfies readonly MilestoneRule[];
export const seasonMilestoneRules = [
  { stat: "h", step: 50, label: "안타" },
  { stat: "hr", step: 10, label: "홈런" },
  { stat: "sb", step: 10, label: "도루" },
] as const satisfies readonly MilestoneRule[];

function crossedMilestones(before: BatterStats, after: BatterStats, rules: readonly MilestoneRule[]) {
  return rules.flatMap(rule => {
    const values = [];
    for (let value = (Math.floor(before[rule.stat] / rule.step) + 1) * rule.step; value <= after[rule.stat]; value += rule.step) {
      values.push({ stat: rule.stat, value, label: rule.label });
    }
    return values;
  });
}

export function recordCareerMilestones(state: SeasonState, game: GameState, before: BatterStats): void {
  if (game.competition !== "REGULAR_SEASON") return;
  const history = state.career.milestones ??= [];
  const opponentId = game.fixture.home === state.config.userTeam ? game.fixture.away : game.fixture.home;
  for (const milestone of crossedMilestones(before, careerStats(state), careerMilestoneRules)) {
    if (milestone.stat === "sb" || history.some(record => record.stat === milestone.stat && record.value === milestone.value)) continue;
    history.push({
      stat: milestone.stat, value: milestone.value, season: state.season,
      fixtureId: game.fixture.id, date: game.fixture.date,
      gameNumber: state.teamRecords[state.config.userTeam].games + 1,
      inning: game.inning, half: game.half,
      opponentId, opponentName: state.leagueData.teams[opponentId].name,
    });
  }
}

/** 이전 달성 기록은 재생하지 않고 이번 조작에서 넘은 구간만 알립니다. */
export function milestoneNotices(before: SeasonState, after: SeasonState): Array<{ label: string; text: string }> {
  if (after.game?.competition !== "REGULAR_SEASON") return [];
  const seasonal = crossedMilestones(before.playerStats["USER-PLAYER"], after.playerStats["USER-PLAYER"], seasonMilestoneRules);
  const career = crossedMilestones(careerStats(before), careerStats(after), careerMilestoneRules);
  return [
    ...seasonal.map(record => ({ label: "SEASON MILESTONE", text: `시즌 ${record.value.toLocaleString("ko-KR")}${record.label} 달성!` })),
    ...career.map(record => ({ label: "CAREER MILESTONE", text: `통산 ${record.value.toLocaleString("ko-KR")}${record.label} 달성!` })),
  ];
}

export function walkOffText(outcome: string): string {
  const labels: Record<string, string> = {
    HR: "홈런", "1B": "안타", "2B": "2루타", "3B": "3루타",
    BB: "밀어내기 볼넷", IBB: "밀어내기 고의사구", HBP: "밀어내기 사구",
    SF: "희생플라이", SH: "희생번트", ROE: "실책", FC: "야수선택", GO: "땅볼",
  };
  return `끝내기 ${labels[outcome] ?? "승리"}!!`;
}

export function validateCareerMilestones(state: SeasonState): void {
  const history = state.career.milestones ?? [];
  if (!Array.isArray(history)) throw new Error("통산 기록 달성 이력이 올바르지 않습니다.");
  const seen = new Set<string>();
  for (const record of history as CareerMilestone[]) {
    const rule = careerMilestoneRules.find(rule => rule.stat === record?.stat);
    const key = `${record?.stat}:${record?.value}`;
    if (!record || !rule || !Number.isInteger(record.value) || record.value <= 0 || record.value % rule.step !== 0
      || !Number.isInteger(record.season) || record.season < 1982 || record.season > 2199
      || typeof record.fixtureId !== "string" || !record.fixtureId
      || !Number.isInteger(record.gameNumber) || record.gameNumber < 1
      || !Number.isInteger(record.inning) || record.inning < 1
      || !["TOP", "BOTTOM"].includes(record.half)
      || !Object.hasOwn(state.leagueData.teams, record.opponentId)
      || typeof record.opponentName !== "string" || !record.opponentName
      || (record.date !== undefined && (typeof record.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)))
      || seen.has(key)) throw new Error("통산 기록 달성 이력이 올바르지 않습니다.");
    seen.add(key);
  }
  state.career.milestones = history;
}

