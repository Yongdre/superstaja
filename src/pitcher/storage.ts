import { addPitchingStats, choiceLabels, createPitcherSchedule, emptyPitchingStats, emptyTeamRecord, finalizePitchingMilestones, pitcherKey, USER_PITCHER_ID, validatePitcherConfig } from "./engine";
import { restorePitchingStreaks } from "./achievements";
import type { Fixture, PitchGame, PitcherDataset, PitcherGameLine, PitcherState, PitchingStats, Runner, TeamRecord } from "./types";

export const PITCHER_SAVE_KEY = "best-pitcher:autosave:v1";
const statKeys = Object.keys(emptyPitchingStats()) as (keyof PitchingStats)[];

// Per-game league records are numerous. Pack the numeric stats for browser storage,
// while retaining ordinary readable objects for exported JSON and the game state.
export function serializePitcherSave(state: PitcherState): string {
  return JSON.stringify(state, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === statKeys.length && statKeys.every((key) => typeof value[key] === "number")) return { $pitching: statKeys.map((key) => value[key]) };
    return value;
  });
}
function invalid(): never { throw new Error("Best Pitcher 세이브 형식이 올바르지 않거나 기록이 손상되었습니다."); }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
const textValue = (value: unknown, max = 2000): value is string => typeof value === "string" && value.length <= max;

const milestoneKeys = ["qualityStarts", "qualityStartsPlus", "noHitNoRuns"] as const;
function checkStats(value: unknown, finishedGame = false): asserts value is PitchingStats {
  if (!object(value)) invalid();
  const missing = milestoneKeys.filter((key) => value[key] === undefined);
  for (const key of missing) value[key] = 0;
  if (finishedGame && missing.length) {
    const derived = { ...value } as unknown as PitchingStats;
    finalizePitchingMilestones(derived);
    for (const key of missing) value[key] = derived[key];
  }
  if (!object(value) || Object.keys(emptyPitchingStats()).some((key) => !integer(value[key]))) invalid();
  const stats = value as unknown as PitchingStats;
  if (stats.earnedRuns > stats.runs || stats.intentionalWalks > stats.walks || stats.starts > stats.games || stats.wins + stats.losses > stats.games || stats.strikeouts > stats.outs || stats.doubles + stats.triples + stats.homeRuns > stats.hits) invalid();
  if (stats.qualityStartsPlus > stats.qualityStarts || stats.qualityStarts > stats.starts || stats.noHitNoRuns > stats.noHitters) invalid();
}

function checkPitchingLines(value: unknown, state: PitcherState, fixture: Fixture): asserts value is Record<string, PitcherGameLine> {
  if (!object(value) || !Object.keys(value).length) invalid();
  for (const [key, entry] of Object.entries(value)) {
    if (!object(entry) || typeof entry.teamId !== "string" || typeof entry.pitcherId !== "string" || ![fixture.home, fixture.away].includes(entry.teamId) || key !== pitcherKey(entry.teamId, entry.pitcherId)) invalid();
    const team = state.dataset.teams[entry.teamId];
    if (entry.pitcherId === USER_PITCHER_ID ? entry.teamId !== state.config.teamId : !team.pitchers.some((pitcher) => pitcher.id === entry.pitcherId)) invalid();
    checkStats(entry.stats);
    if (entry.stats.games !== 1 || entry.stats.starts > 1) invalid();
  }
  for (const team of [fixture.home, fixture.away]) {
    const lines = Object.values(value as unknown as Record<string, PitcherGameLine>).filter((line) => line.teamId === team);
    if (lines.reduce((total, line) => total + line.stats.starts, 0) !== 1) invalid();
  }
}

function checkRecord(value: unknown): asserts value is TeamRecord {
  if (!object(value) || Object.keys(emptyTeamRecord()).some((key) => !integer(value[key]))) invalid();
  if (value.games !== Number(value.wins) + Number(value.losses) + Number(value.ties)) invalid();
}

function checkDataset(value: unknown): asserts value is PitcherDataset {
  if (!object(value) || !textValue(value.id, 200) || !textValue(value.label, 500) || !integer(value.year, 2199) || !["KBO", "MLB"].includes(String(value.league)) || !object(value.teams)) invalid();
  const dataset = value as unknown as PitcherDataset;
  if (Object.keys(dataset.teams).length !== (dataset.league === "KBO" ? 10 : 30)) invalid();
  for (const [id, team] of Object.entries(dataset.teams)) {
    if (!object(team) || team.id !== id || !textValue(team.name, 100) || !textValue(team.shortName, 50) || !Array.isArray(team.hitters) || team.hitters.length < 9 || !Array.isArray(team.pitchers) || !team.pitchers.some((pitcher) => pitcher.role === "SP")) invalid();
    for (const hitter of team.hitters) {
      if (!object(hitter) || !textValue(hitter.id, 100) || !textValue(hitter.name, 100) || [hitter.contact, hitter.power, hitter.discipline, hitter.speed].some((rating) => typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 100)) invalid();
      if (hitter.statProfile && (!object(hitter.statProfile) || !Number.isFinite(hitter.statProfile.avg) || !Number.isFinite(hitter.statProfile.games) || !Number.isFinite(hitter.statProfile.homeRuns))) invalid();
    }
    for (const pitcher of team.pitchers) {
      if (!object(pitcher) || !textValue(pitcher.id, 100) || !textValue(pitcher.name, 100) || !["SP", "RP", "CP"].includes(pitcher.role) || [pitcher.stuff, pitcher.movement, pitcher.control, pitcher.stamina].some((rating) => typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 100)) invalid();
    }
  }
}

function sameFixture(a: Fixture, b: Fixture): boolean {
  return Boolean(a && b && a.id === b.id && a.day === b.day && a.home === b.home && a.away === b.away);
}

function checkRunner(value: unknown): asserts value is Runner | null {
  if (value === null) return;
  if (!object(value) || !textValue(value.id, 100) || !textValue(value.name, 100) || typeof value.earned !== "boolean" || typeof value.responsibleUser !== "boolean" || (value.pitcherKey !== undefined && !textValue(value.pitcherKey, 250))) invalid();
}

function checkGame(value: unknown, state: PitcherState) {
  if (!object(value)) invalid();
  const game = value as unknown as PitchGame;
  checkStats(game.stats, game.phase === "FINISHED");
  const fixtureIndex = state.schedule.findIndex((fixture) => sameFixture(fixture, game.fixture));
  if (fixtureIndex < 0 || !game.controlled || !integer(game.inning, 1000) || game.inning < 1 || !["TOP", "BOTTOM"].includes(game.half) || !integer(game.outs, 3) || !["PITCHING", "FINISHED"].includes(game.phase) || !["W", "L", "ND"].includes(game.decision)) invalid();
  if (typeof game.userActive !== "boolean" || typeof game.userWinEligible !== "boolean" || !Array.isArray(game.bases) || game.bases.length !== 3) invalid();
  game.bases.forEach(checkRunner);
  if (game.phase === "PITCHING" && (fixtureIndex !== state.cursor || !game.userActive || game.outs >= 3 || (game.half === "TOP" ? game.fixture.home : game.fixture.away) !== state.config.teamId)) invalid();
  if (game.phase === "FINISHED" && (fixtureIndex >= state.cursor || !state.results[fixtureIndex]?.controlled)) invalid();
  for (const id of [game.fixture.home, game.fixture.away]) {
    if (!object(game.score) || !object(game.hits) || !object(game.battingIndex) || !object(game.lineScore) || !integer(game.score[id]) || !integer(game.hits[id]) || !integer(game.battingIndex[id], 8) || !Array.isArray(game.lineScore[id]) || game.lineScore[id].some((runs) => runs != null && !integer(runs))) invalid();
  }
  if (!integer(game.nextLogId) || !Array.isArray(game.log) || game.log.length > 240 || game.log.some((entry) => !object(entry) || !integer(entry.id) || !integer(entry.inning) || !["TOP", "BOTTOM"].includes(entry.half) || !textValue(entry.text) || !["choice", "auto", "system"].includes(entry.kind))) invalid();
  if (game.log.some((entry) => (entry.important !== undefined && typeof entry.important !== "boolean") || (entry.outcome !== undefined && !Object.hasOwn(choiceLabels, entry.outcome)) || (entry.teamId !== undefined && ![game.fixture.home, game.fixture.away].includes(entry.teamId)) || (entry.runsScored !== undefined && !integer(entry.runsScored, 4)))) invalid();
  if (game.focusLogId !== undefined && (!integer(game.focusLogId) || game.focusLogId >= game.nextLogId)) invalid();
  game.streaks ??= restorePitchingStreaks(game.log);
  if (!object(game.streaks) || !integer(game.streaks.strikeouts, game.stats.strikeouts) || !integer(game.streaks.outBatters, game.stats.battersFaced) || game.streaks.strikeouts > game.streaks.outBatters) invalid();
  if (game.goAhead && (!object(game.goAhead) || ![game.fixture.home, game.fixture.away].includes(game.goAhead.team) || typeof game.goAhead.winUser !== "boolean" || typeof game.goAhead.lossUser !== "boolean")) invalid();
  if (game.pitching !== undefined) {
    if (!object(game.pitching) || !object(game.pitching.active)) invalid();
    checkPitchingLines(game.pitching.lines, state, game.fixture);
    for (const team of [game.fixture.home, game.fixture.away]) if (game.pitching.lines[game.pitching.active[team]]?.teamId !== team) invalid();
    for (const runner of game.bases) if (runner && (!runner.pitcherKey || game.pitching.lines[runner.pitcherKey]?.teamId !== (game.half === "TOP" ? game.fixture.home : game.fixture.away))) invalid();
    for (const key of [game.goAhead?.winnerKey, game.goAhead?.loserKey]) if (key !== undefined && !game.pitching.lines[key]) invalid();
  }
}

export function parsePitcherSave(contents: string): PitcherState {
  if (contents.length > 20_000_000) throw new Error("세이브 파일은 20MB 이하로 가져와 주세요.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents, (_key, value) => {
      if (object(value) && Object.hasOwn(value, "$pitching")) {
        if (Object.keys(value).length !== 1 || !Array.isArray(value.$pitching) || value.$pitching.length !== statKeys.length || value.$pitching.some((item) => !integer(item))) invalid();
        const packed = value.$pitching;
        return Object.fromEntries(statKeys.map((key, index) => [key, packed[index]]));
      }
      return value;
    });
  } catch { throw new Error("올바른 JSON 파일이 아니거나 투구 기록이 손상되었습니다."); }
  if (!object(parsed) || parsed.schemaVersion !== 1 || parsed.gameType !== "BEST_PITCHER" || !object(parsed.config)) throw new Error("Best Pitcher 세이브 파일을 선택해 주세요.");
  const state = parsed as unknown as PitcherState;
  if (state.eraRestriction !== undefined && (!object(state.eraRestriction) || !integer(state.eraRestriction.remaining, 3) || (state.eraRestriction.cooldownFixtureId !== undefined && !textValue(state.eraRestriction.cooldownFixtureId, 200)))) invalid();
  checkDataset(state.dataset);
  validatePitcherConfig(state.config, state.dataset);
  if (!integer(state.year, 2199) || state.year < state.config.debutYear || !integer(state.rngState, 4294967295) || typeof state.seasonComplete !== "boolean") invalid();
  const expected = createPitcherSchedule(state.dataset, state.year, state.config.seed);
  if (!Array.isArray(state.schedule) || state.schedule.length !== expected.length || expected.some((fixture, index) => !sameFixture(fixture, state.schedule[index]))) invalid();
  if (!integer(state.cursor, expected.length) || !Array.isArray(state.results) || state.results.length !== state.cursor || !object(state.records)) invalid();
  const missingMilestones = milestoneKeys.filter((key) => state.stats?.[key] === undefined);
  checkStats(state.stats);
  const totals = emptyPitchingStats();
  const leagueTotals: Record<string, PitchingStats> = {};
  const records = Object.fromEntries(Object.keys(state.dataset.teams).map((id) => [id, emptyTeamRecord()]));
  state.results.forEach((result, index) => {
    if (!object(result) || !sameFixture(result.fixture, expected[index]) || !integer(result.homeScore) || !integer(result.awayScore) || typeof result.controlled !== "boolean") invalid();
    const { home, away } = result.fixture;
    if (result.controlled) {
      if (![home, away].includes(state.config.teamId) || !["W", "L", "ND"].includes(result.decision!)) invalid();
      checkStats(result.stats, true);
      Object.assign(totals, addPitchingStats(totals, result.stats));
    }
    if (result.pitching !== undefined) {
      checkPitchingLines(result.pitching, state, result.fixture);
      for (const [team, allowedRuns] of [[home, result.awayScore], [away, result.homeScore]] as const) {
        if (Object.values(result.pitching).filter((line) => line.teamId === team).reduce((sum, line) => sum + line.stats.runs, 0) !== allowedRuns) invalid();
      }
      for (const [key, line] of Object.entries(result.pitching)) leagueTotals[key] = addPitchingStats(leagueTotals[key] ?? emptyPitchingStats(), line.stats);
      if (result.controlled) {
        const userStats = result.pitching[pitcherKey(state.config.teamId, USER_PITCHER_ID)]?.stats;
        if (!userStats || (Object.keys(totals) as (keyof PitchingStats)[]).some((key) => userStats[key] !== result.stats![key])) invalid();
      }
    }
    for (const [team, ownScore, otherScore] of [[home, result.homeScore, result.awayScore], [away, result.awayScore, result.homeScore]] as const) {
      const record = records[team];
      record.games++; record.runsFor += ownScore; record.runsAgainst += otherScore;
      if (ownScore > otherScore) record.wins++;
      else if (ownScore < otherScore) record.losses++;
      else record.ties++;
    }
  });
  for (const key of missingMilestones) state.stats[key] = totals[key];
  if ((Object.keys(totals) as (keyof PitchingStats)[]).some((key) => totals[key] !== state.stats[key])) invalid();
  state.leaguePitching ??= leagueTotals;
  if (!object(state.leaguePitching) || Object.keys(state.leaguePitching).length !== Object.keys(leagueTotals).length) invalid();
  for (const [key, stats] of Object.entries(state.leaguePitching)) {
    checkStats(stats);
    if (!leagueTotals[key] || (Object.keys(totals) as (keyof PitchingStats)[]).some((field) => stats[field] !== leagueTotals[key][field])) invalid();
  }
  for (const [id, record] of Object.entries(records)) {
    checkRecord(state.records[id]);
    if ((Object.keys(record) as (keyof TeamRecord)[]).some((key) => record[key] !== state.records[id][key])) invalid();
  }
  if (!Array.isArray(state.history) || state.history.length !== state.year - state.config.debutYear) invalid();
  state.history.forEach((season, index) => {
    if (!object(season) || season.year !== state.config.debutYear + index || season.league !== state.config.league || !textValue(season.teamName, 100) || !Number.isFinite(season.targetEra) || season.targetEra < 0 || season.targetEra > 30) invalid();
    if (milestoneKeys.some((key) => season.stats?.[key] === undefined)) season.detailedMilestonesKnown = false;
    if (season.detailedMilestonesKnown !== undefined && typeof season.detailedMilestonesKnown !== "boolean") invalid();
    checkStats(season.stats); checkRecord(season.record);
  });
  state.startInterval ??= 5;
  state.nextStartGameNumber ??= Math.max(1, state.records[state.config.teamId].games + (state.game?.phase === "PITCHING" ? 1 : 0));
  if (![3, 4, 5].includes(state.startInterval) || !integer(state.nextStartGameNumber, (state.config.league === "KBO" ? 144 : 162) + 5) || state.nextStartGameNumber < 1) invalid();
  if (state.leaguePitchingSinceGames === undefined) {
    state.leaguePitchingSinceGames = Object.fromEntries(Object.entries(state.records).map(([id, record]) => [id, record.games]));
    if (state.game?.phase === "PITCHING" && !state.game.pitching) for (const team of [state.game.fixture.home, state.game.fixture.away]) state.leaguePitchingSinceGames[team]++;
  }
  if (!object(state.leaguePitchingSinceGames) || Object.keys(state.leaguePitchingSinceGames).length !== Object.keys(records).length) invalid();
  for (const id of Object.keys(records)) if (!integer(state.leaguePitchingSinceGames[id], records[id].games + 1)) invalid();
  if (state.game !== null) checkGame(state.game, state);
  if (!state.game || state.seasonComplete !== (state.cursor === state.schedule.length)) invalid();
  return state;
}

export function savePitcherGame(state: PitcherState): void { localStorage.setItem(PITCHER_SAVE_KEY, serializePitcherSave(state)); }
export function loadPitcherGame(): PitcherState | null {
  const value = localStorage.getItem(PITCHER_SAVE_KEY);
  return value ? parsePitcherSave(value) : null;
}
export function hasPitcherSave(): boolean {
  try { return Boolean(localStorage.getItem(PITCHER_SAVE_KEY)); } catch { return false; }
}
export function exportPitcherGame(state: PitcherState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `best-pitcher-${state.config.league}-${state.year}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
