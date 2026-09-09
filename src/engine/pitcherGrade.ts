import type { PitcherGrade, PitcherProfile } from "./types";

type PitchingRatings = Pick<PitcherProfile, "stuff" | "movement" | "control">;

/** 표시용 분류이며 경기 확률에 별도 보정을 더하지 않습니다. 체력은 제외합니다. */
export function calculatePitcherGrade(pitcher: PitchingRatings): PitcherGrade {
  const score = (pitcher.stuff + pitcher.movement + pitcher.control) / 3;
  if (score >= 85) return "S";
  if (score >= 78) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function getPitcherGrade(pitcher: PitchingRatings & Pick<PitcherProfile, "grade">): PitcherGrade {
  return pitcher.grade ?? calculatePitcherGrade(pitcher);
}
