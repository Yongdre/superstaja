import type { FieldPosition, HitterStatProfile, PitcherProfile, PitcherStatProfile } from "./types";

export const fieldPositions: FieldPosition[] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];

const clampRating = (value: number) => Math.max(1, Math.min(99, Math.round(value)));

export function parsePositions(value: string): FieldPosition[] {
  const result = new Set<FieldPosition>();
  for (const token of value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)) {
    if (token === "OF") ["LF", "CF", "RF"].forEach((position) => result.add(position as FieldPosition));
    else if (token === "IF") ["1B", "2B", "3B", "SS"].forEach((position) => result.add(position as FieldPosition));
    else if (token === "UTIL") fieldPositions.forEach((position) => result.add(position));
    else if (fieldPositions.includes(token as FieldPosition)) result.add(token as FieldPosition);
    else throw new Error(`지원하지 않는 수비 위치입니다: ${token}`);
  }
  if (!result.size) throw new Error("타자에게 수비 위치가 최소 하나 필요합니다.");
  return [...result];
}

export function estimateHitterRatings(profile: HitterStatProfile) {
  const games = Math.max(1, profile.games);
  const plateAppearances = profile.plateAppearances ?? Math.round(games * 4.1);
  const fullSeasonHomeRuns = profile.homeRuns * 144 / games;
  const fullSeasonSteals = (profile.stolenBases ?? 0) * 144 / games;
  const walkRate = profile.walks !== undefined
    ? profile.walks / Math.max(1, plateAppearances)
    : profile.onBasePct !== undefined
      ? Math.max(0.025, (profile.onBasePct - profile.avg) / Math.max(0.2, 1 - profile.avg))
      : 0.075;
  const stealSuccess = profile.caughtStealing !== undefined
    ? (profile.stolenBases ?? 0) / Math.max(1, (profile.stolenBases ?? 0) + profile.caughtStealing)
    : 0.7;
  return {
    contact: clampRating(50 + (profile.avg - 0.26) * 500),
    power: clampRating(38 + fullSeasonHomeRuns * 1.6),
    discipline: clampRating(profile.eye === undefined ? 35 + walkRate * 450 : 15 + profile.eye * 8),
    speed: clampRating(profile.speed === undefined ? 35 + fullSeasonSteals * 1.35 + (stealSuccess - 0.65) * 25 : 15 + profile.speed * 8),
  };
}

export function estimatePitcherRatings(profile: PitcherStatProfile, role: PitcherProfile["role"]) {
  const quality = Math.max(15, Math.min(96, 50 + (4.5 - profile.era) * 11));
  const innings = profile.innings ?? (role === "SP" ? 120 : 55);
  const strikeoutsPerNine = profile.strikeouts !== undefined ? profile.strikeouts * 9 / Math.max(1, innings) : undefined;
  const walksPerNine = profile.walks !== undefined ? profile.walks * 9 / Math.max(1, innings) : undefined;
  return {
    stuff: clampRating(strikeoutsPerNine === undefined ? quality + 3 : 35 + strikeoutsPerNine * 5 + (quality - 50) * 0.25),
    movement: clampRating(quality + (strikeoutsPerNine === undefined ? 0 : (strikeoutsPerNine - 7) * 1.4)),
    control: clampRating(walksPerNine === undefined ? quality : 92 - walksPerNine * 10 + (quality - 50) * 0.2),
    stamina: clampRating(role === "SP" ? 38 + innings * 0.28 : 35 + Math.min(15, innings / 5)),
  };
}
