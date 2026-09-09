import type { Baserunner } from "./types";
import type { SeededRng } from "./rng";

export type Bases = [Baserunner | null, Baserunner | null, Baserunner | null];

export interface AdvanceResult {
  bases: Bases;
  scored: Baserunner[];
}

export function advanceOnForcedWalk(bases: Bases, batter: Baserunner): AdvanceResult {
  const next: Bases = [...bases] as Bases;
  const scored: Baserunner[] = [];
  if (next[0]) {
    if (next[1]) {
      if (next[2]) scored.push(next[2]);
      next[2] = next[1];
    }
    next[1] = next[0];
  }
  next[0] = batter;
  return { bases: next, scored };
}

export function advanceOnHomeRun(bases: Bases, batter: Baserunner): AdvanceResult {
  return {
    bases: [null, null, null],
    scored: [...bases.filter((runner): runner is Baserunner => Boolean(runner)), batter],
  };
}

export interface StealResult {
  success: boolean;
  bases: Bases;
  outsAdded: number;
}

export interface AutomaticStealPlan {
  successProbability: number;
  maxAttempts: number;
  attemptChance: number;
}

const automaticStealPlans: Partial<Record<number, AutomaticStealPlan>> = {
  7: { successProbability: 0.72, maxAttempts: 30, attemptChance: 0.14 },
  8: { successProbability: 0.78, maxAttempts: 40, attemptChance: 0.19 },
  9: { successProbability: 0.84, maxAttempts: 50, attemptChance: 0.25 },
  10: { successProbability: 0.90, maxAttempts: 60, attemptChance: 0.32 },
};

export function automaticStealPlan(speedGrade: number): AutomaticStealPlan | undefined {
  return automaticStealPlans[Math.round(speedGrade)];
}

export function attemptSteal(
  bases: Bases,
  rng: SeededRng,
  successProbability: number,
): StealResult {
  const runner = bases[0];
  if (!runner || bases[1]) return { success: false, bases, outsAdded: 0 };
  // 전달된 최종 성공률로 매번 새로 판정합니다. 수비·주루 능력이나 과거 결과로 보정하지 않습니다.
  if (rng.chance(successProbability)) return { success: true, bases: [null, runner, bases[2]], outsAdded: 0 };
  return { success: false, bases: [null, bases[1], bases[2]], outsAdded: 1 };
}
