import type { LeagueDataset, TeamId } from "../engine/types";
import { pitcherGrades } from "../engine/types";
import { canFieldTeam } from "../engine/lineup";
import { estimateHitterRatings, estimatePitcherRatings, parsePositions } from "../engine/playerProfiles";


export const supportedTeamIds: TeamId[] = ["ATH","ATL","AZ","BAL","BOS","CHC","CIN","CLE","COL","CWS","DET","HOU","KC","LAA","LAD","MIA","MIL","MIN","NYM","NYY","PHI","PIT","SD","SEA","SF","STL","TB","TEX","TOR","WSH"];

const ratingKeys = ["contact", "power", "discipline", "speed"] as const;
const pitchingKeys = ["stuff", "movement", "control", "stamina"] as const;
const hitterCountKeys = ["games", "plateAppearances", "atBats", "homeRuns", "doubles", "triples", "walks", "strikeouts", "stolenBases", "caughtStealing"] as const;
const pitcherCountKeys = ["innings", "games", "gamesStarted", "strikeouts", "walks", "saves"] as const;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// 기존 일정·세이브의 내부 ID는 유지하고, 업로드 JSON의 대체 약칭도 허용합니다.
const canonicalTeamId = (id: string) => id === "OAK" ? "ATH" : id === "ARI" ? "AZ" : id;

function normalizeTeamAliases(teams: LeagueDataset["teams"]): LeagueDataset["teams"] {
  const seen = new Set<string>();
  return Object.fromEntries(Object.entries(teams).map(([inputId, team]) => {
    const id = canonicalTeamId(inputId);
    if (seen.has(id)) throw new Error(`같은 팀이 중복되어 있습니다: ${id} (${id === "ATH" ? "ATH/OAK" : "AZ/ARI"})`);
    seen.add(id);
    if (team && typeof team === "object") {
      // key와 id는 독립적으로 정규화하되 서로 다른 팀이면 아래 검증에서 거부합니다.
      team.id = canonicalTeamId(team.id) as TeamId;
      if (id === "ATH" && ["ATH", "OAK"].includes(team.shortName)) team.shortName = "OAK";
      if (id === "AZ" && ["AZ", "ARI"].includes(team.shortName)) team.shortName = "ARI";
    }
    return [id, team];
  })) as LeagueDataset["teams"];
}

function validateHitterStatProfile(hitter: LeagueDataset["teams"][TeamId]["hitters"][number]) {
  const profile = hitter.statProfile;
  if (!profile) return;
  if (!Number.isInteger(profile.games) || profile.games < 0 || profile.games > 162) throw new Error(`${hitter.name}의 games는 0–162 사이의 정수여야 합니다.`);
  if (!isFiniteNumber(profile.avg) || profile.avg < 0 || profile.avg > 1) throw new Error(`${hitter.name}의 avg는 0–1 사이여야 합니다.`);
  if (profile.eye !== undefined && (!Number.isInteger(profile.eye) || profile.eye < 1 || profile.eye > 10)) throw new Error(`${hitter.name}의 eye는 1–10 사이의 정수여야 합니다.`);
  if (profile.speed !== undefined && (!Number.isInteger(profile.speed) || profile.speed < 1 || profile.speed > 10)) throw new Error(`${hitter.name}의 speed는 1–10 사이의 정수여야 합니다.`);
  for (const key of hitterCountKeys) {
    const value = profile[key];
    if (value !== undefined && (!isFiniteNumber(value) || value < 0)) throw new Error(`${hitter.name}의 ${key}는 0 이상의 숫자여야 합니다.`);
  }
  if (profile.onBasePct !== undefined && (!isFiniteNumber(profile.onBasePct) || profile.onBasePct < 0 || profile.onBasePct > 1)) throw new Error(`${hitter.name}의 onBasePct는 0–1 사이여야 합니다.`);
}

function validatePitcherStatProfile(pitcher: LeagueDataset["teams"][TeamId]["pitchers"][number]) {
  const profile = pitcher.statProfile;
  if (!profile) return;
  if (!isFiniteNumber(profile.era) || profile.era < 0 || profile.era > 30) throw new Error(`${pitcher.name}의 era는 0–30 사이여야 합니다.`);
  for (const key of pitcherCountKeys) {
    const value = profile[key];
    if (value !== undefined && (!isFiniteNumber(value) || value < 0)) throw new Error(`${pitcher.name}의 ${key}는 0 이상의 숫자여야 합니다.`);
  }
}

export function validateLeagueDataset(value: unknown): LeagueDataset {
  if (!value || typeof value !== "object") throw new Error("리그 데이터 JSON이 아닙니다.");
  const dataset = structuredClone(value) as Partial<LeagueDataset>;
  if (dataset.schemaVersion !== 1 || typeof dataset.label !== "string" || !dataset.teams) {
    throw new Error("지원하지 않는 리그 데이터 형식입니다.");
  }
  if (dataset.sourceSeason !== undefined && (!Number.isInteger(dataset.sourceSeason) || dataset.sourceSeason < 1982 || dataset.sourceSeason > 2199)) {
    throw new Error("sourceSeason은 1982–2199 사이의 정수여야 합니다.");
  }
  dataset.teams = normalizeTeamAliases(dataset.teams);
  const ids = Object.keys(dataset.teams);
  if (ids.length !== 30 || supportedTeamIds.some((id) => !ids.includes(id))) {
    throw new Error(`팀 ID는 ${supportedTeamIds.join(", ")}를 정확히 한 번씩 포함해야 합니다.`);
  }
  const playerIds = new Set<string>();
  for (const teamId of supportedTeamIds) {
    const team = dataset.teams[teamId];
    if (!team || team.id !== teamId || !team.name || !team.shortName || !team.city) throw new Error(`${teamId} 팀 기본 정보가 올바르지 않습니다.`);
    if (!Array.isArray(team.hitters) || team.hitters.length < 9) throw new Error(`${teamId}에는 타자가 최소 9명 필요합니다.`);
    if (!Array.isArray(team.pitchers) || !team.pitchers.some((pitcher) => pitcher.role === "SP") || !team.pitchers.some((pitcher) => pitcher.role !== "SP")) {
      throw new Error(`${teamId}에는 선발투수와 불펜투수가 모두 필요합니다.`);
    }
    for (const hitter of team.hitters) {
      if (!hitter.id || !hitter.name || playerIds.has(hitter.id)) throw new Error(`중복되거나 비어 있는 타자 ID가 있습니다: ${hitter.id || "(없음)"}`);
      if (!["L", "R", "S"].includes(hitter.bats)) throw new Error(`${hitter.name}의 bats는 L, R 또는 S여야 합니다.`);
      parsePositions(hitter.position);
      if (hitter.availability !== undefined && hitter.availability !== "REGULAR" && hitter.availability !== "INJURY") throw new Error(`${hitter.name}의 availability는 REGULAR 또는 INJURY여야 합니다.`);
      validateHitterStatProfile(hitter);
      const estimated = hitter.statProfile ? estimateHitterRatings(hitter.statProfile) : undefined;
      if (estimated) Object.assign(hitter, estimated, hitter.ratingOverrides ?? {});
      ratingKeys.forEach((key) => {
        if (!isFiniteNumber(hitter[key]) || hitter[key] < 0 || hitter[key] > 100) throw new Error(`${hitter.name}의 ${key}는 0–100이거나 statProfile로 추정 가능해야 합니다.`);
      });
      playerIds.add(hitter.id);
    }
    for (const pitcher of team.pitchers) {
      if (!pitcher.id || !pitcher.name || playerIds.has(pitcher.id)) throw new Error(`중복되거나 비어 있는 투수 ID가 있습니다: ${pitcher.id || "(없음)"}`);
      if (pitcher.throws !== "L" && pitcher.throws !== "R") throw new Error(`${pitcher.name}의 throws는 L 또는 R이어야 합니다.`);
      if (!["SP", "RP", "CP"].includes(pitcher.role)) throw new Error(`${pitcher.name}의 role은 SP, RP, CP 중 하나여야 합니다.`);
      if (pitcher.grade !== undefined && !pitcherGrades.includes(pitcher.grade)) throw new Error(`${pitcher.name}의 grade는 S, A, B, C, D 중 하나여야 합니다.`);
      validatePitcherStatProfile(pitcher);
      const estimated = pitcher.statProfile ? estimatePitcherRatings(pitcher.statProfile, pitcher.role) : undefined;
      if (estimated) Object.assign(pitcher, estimated, pitcher.ratingOverrides ?? {});
      // schemaVersion 1의 기존 JSON은 movement가 없으므로 stuff를 안전한 기본값으로 사용합니다.
      pitcher.movement ??= pitcher.stuff;
      pitchingKeys.forEach((key) => {
        if (!isFiniteNumber(pitcher[key]) || pitcher[key] < 0 || pitcher[key] > 100) throw new Error(`${pitcher.name}의 ${key}는 0–100이거나 statProfile로 추정 가능해야 합니다.`);
      });
      playerIds.add(pitcher.id);
    }
    const targetStarts = team.hitters.reduce((sum, hitter) => sum + (hitter.statProfile?.games ?? 162), 0);
    if (targetStarts < 9 * 162) throw new Error(`${team.name}의 타자 목표 출장 합계는 최소 1,458경기여야 합니다. 현재 ${targetStarts}경기입니다.`);
    if (!canFieldTeam(team)) throw new Error(`${team.name}은(는) C, 1B, 2B, 3B, SS, LF, CF, RF, DH 라인업을 구성할 수 없습니다.`);
  }
  return dataset as LeagueDataset;
}


export interface LeagueDatasetEntry {
  id: string;
  filename: string;
  dataset: LeagueDataset;
}

/** 파일의 첫 번째 4자리 연도를 사용하고 ver/version 등 후속 숫자는 무시합니다. */
export function seasonYearFromFilename(filename: string): number | undefined {
  const match = filename.match(/(?:^|[^0-9])((?:19|20|21)\d{2})(?!\d)/);
  const year = match ? Number(match[1]) : undefined;
  return year !== undefined && year >= 1982 && year <= 2199 ? year : undefined;
}

export function validateSeasonDataset(value: unknown, filename: string): LeagueDataset {
  const year = seasonYearFromFilename(filename);
  const normalized = value && typeof value === "object" && year !== undefined
    ? { ...value, sourceSeason: year } : value;
  return validateLeagueDataset(normalized);
}

export function buildLeagueCatalog(modules: Record<string, { default: unknown }>): { entries: LeagueDatasetEntry[]; issues: string[] } {
  const entries: LeagueDatasetEntry[] = [], issues: string[] = [];
  for (const [path, module] of Object.entries(modules)) {
    try {
      entries.push({ id: "builtin:" + path, filename: path.split("/").pop()!, dataset: validateSeasonDataset(module.default, path.split("/").pop()!) });
    } catch (error) {
      issues.push(`${path}: ${error instanceof Error ? error.message : "JSON 검증 실패"}`);
    }
  }
  entries.sort((left, right) => (left.dataset.sourceSeason ?? 0) - (right.dataset.sourceSeason ?? 0) || left.filename.localeCompare(right.filename));
  return { entries, issues };
}

// 파일명 형식에 관계없이 시즌 폴더에 있는 모든 리그 JSON을 등록합니다.
const seasonModules = import.meta.glob<{ default: unknown }>("./seasons/*.json", { eager: true });
const seasonCatalog = buildLeagueCatalog(seasonModules);
export const builtInLeagueEntries = seasonCatalog.entries;
export const builtInLeagueIssues = seasonCatalog.issues;
export const builtInLeagueDatasets = builtInLeagueEntries.map(entry => entry.dataset);

// 특정 옛 파일명을 import하지 않으므로 파일을 교체해도 앱을 실행할 수 있습니다.
const defaultEntry = builtInLeagueEntries.find(entry => entry.dataset.sourceSeason === 2016) ?? builtInLeagueEntries[0];
if (!defaultEntry) throw new Error("사용 가능한 시즌 JSON이 없습니다. " + builtInLeagueIssues.join(" / "));
export const defaultLeagueDataset = defaultEntry.dataset;
export const leagueDataTemplate = structuredClone(defaultLeagueDataset);


export function getBuiltInLeagueDataset(season: number): LeagueDataset | undefined {
  const matching = builtInLeagueEntries.filter(entry => entry.dataset.sourceSeason === season);
  return (matching.find(entry => entry.filename === `mlb-league-data-${season}.json`) ?? matching[0])?.dataset;
}

export const leagueTeamIds = (dataset: LeagueDataset) => Object.keys(dataset.teams) as TeamId[];
