import { fieldPositions, parsePositions } from "./playerProfiles";
import type { FieldPosition, HitterProfile, TeamDefinition } from "./types";

const seasonGames = 144;
const planCache = new WeakMap<TeamDefinition, Map<string, string[][]>>();

const targetGames = (hitter: HitterProfile) => Math.max(0, Math.min(seasonGames, Math.round(hitter.statProfile?.games ?? seasonGames)));

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unavailableByInjury(hitter: HitterProfile, day: number, season: number) {
  if (hitter.availability !== "INJURY") return false;
  const missedGames = seasonGames - targetGames(hitter);
  if (missedGames <= 0) return false;
  const injuryStart = hashText(`${season}:${hitter.id}`) % (seasonGames - missedGames + 1);
  return day >= injuryStart && day < injuryStart + missedGames;
}

function eligiblePositions(hitter: HitterProfile, slots: FieldPosition[]) {
  const natural = parsePositions(hitter.position).filter((position) => slots.includes(position));
  if (slots.includes("DH") && !natural.includes("DH")) natural.push("DH");
  return natural;
}

function matchPlayers(players: HitterProfile[], slots: FieldPosition[]): Map<string, FieldPosition> | null {
  const positionOwner = new Map<FieldPosition, HitterProfile>();
  const ordered = [...players].sort((left, right) => eligiblePositions(left, slots).length - eligiblePositions(right, slots).length);

  const assign = (player: HitterProfile, seen: Set<FieldPosition>): boolean => {
    for (const position of eligiblePositions(player, slots)) {
      if (seen.has(position)) continue;
      seen.add(position);
      const current = positionOwner.get(position);
      if (!current || assign(current, seen)) {
        positionOwner.set(position, player);
        return true;
      }
    }
    return false;
  };

  for (const player of ordered) if (!assign(player, new Set())) return null;
  return new Map([...positionOwner].map(([position, player]) => [player.id, position]));
}

function choosePlayers(team: TeamDefinition, slots: FieldPosition[], day: number, season: number, appearances: Map<string, number>) {
  const rosterOrder = new Map(team.hitters.map((hitter, index) => [hitter.id, index]));
  const score = (hitter: HitterProfile) => {
    const remainingNeed = targetGames(hitter) - (appearances.get(hitter.id) ?? 0);
    const naturalFit = parsePositions(hitter.position).some((position) => slots.includes(position));
    return remainingNeed / Math.max(1, seasonGames - day) + (naturalFit ? 0 : -1);
  };
  const healthy = team.hitters.filter((hitter) => !unavailableByInjury(hitter, day, season));
  const injured = team.hitters.filter((hitter) => unavailableByInjury(hitter, day, season));
  const candidates = [...healthy, ...injured].sort((left, right) => {
    const healthDifference = Number(unavailableByInjury(left, day, season)) - Number(unavailableByInjury(right, day, season));
    return healthDifference || score(right) - score(left) || (rosterOrder.get(left.id)! - rosterOrder.get(right.id)!);
  });
  const selected: HitterProfile[] = [];
  for (const candidate of candidates) {
    if (selected.length === slots.length) break;
    const next = [...selected, candidate];
    if (matchPlayers(next, slots)) selected.push(candidate);
  }
  if (selected.length !== slots.length) throw new Error(`${team.name}은(는) ${slots.join(", ")} 포지션의 라인업을 구성할 수 없습니다.`);
  return selected;
}

export function buildSeasonLineupPlan(team: TeamDefinition, season: number, reservedPosition?: FieldPosition): string[][] {
  const cacheKey = `${season}:${reservedPosition ?? "NONE"}`;
  const cached = planCache.get(team)?.get(cacheKey);
  if (cached) return cached;

  const slots = fieldPositions.filter((position) => position !== reservedPosition);
  const appearances = new Map(team.hitters.map((hitter) => [hitter.id, 0]));
  const rosterOrder = new Map(team.hitters.map((hitter, index) => [hitter.id, index]));
  const fixedRoster = team.hitters.every((hitter) => targetGames(hitter) === seasonGames && hitter.availability !== "INJURY");
  if (fixedRoster) {
    const lineup = choosePlayers(team, slots, 0, season, appearances)
      .sort((left, right) => rosterOrder.get(left.id)! - rosterOrder.get(right.id)!)
      .map((hitter) => hitter.id);
    const plan = Array.from({ length: seasonGames }, () => [...lineup]);
    const cache = planCache.get(team) ?? new Map<string, string[][]>();
    cache.set(cacheKey, plan);
    planCache.set(team, cache);
    return plan;
  }
  const plan = Array.from({ length: seasonGames }, (_, day) => {
    const players = choosePlayers(team, slots, day, season, appearances);
    players.forEach((hitter) => appearances.set(hitter.id, (appearances.get(hitter.id) ?? 0) + 1));
    return players.sort((left, right) => rosterOrder.get(left.id)! - rosterOrder.get(right.id)!).map((hitter) => hitter.id);
  });
  const cache = planCache.get(team) ?? new Map<string, string[][]>();
  cache.set(cacheKey, plan);
  planCache.set(team, cache);
  return plan;
}

export function canFieldTeam(team: TeamDefinition) {
  try {
    const appearances = new Map(team.hitters.map((hitter) => [hitter.id, 0]));
    return choosePlayers(team, fieldPositions, 0, 2000, appearances).length === fieldPositions.length;
  } catch {
    return false;
  }
}
