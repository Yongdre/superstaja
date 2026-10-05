import { SeededRng } from "../engine/rng";
import { generateSchedule as kboSchedule } from "../engine/schedule";
import { generateSchedule as mlbSchedule } from "../../_mlb/src/engine/schedule";
import type { TeamId as KboTeamId } from "../engine/types";
import type { TeamId as MlbTeamId } from "../../_mlb/src/engine/types";
import type { PitcherProfile } from "../engine/types";
import type { Fixture, PitchChoice, PitchGame, PitcherConfig, PitcherDataset, PitcherHitter, PitcherState, PitchingStats, Runner, StartInterval, TeamRecord } from "./types";

export const emptyPitchingStats = (): PitchingStats => ({
  games: 0, starts: 0, wins: 0, losses: 0, outs: 0, hits: 0, doubles: 0, triples: 0,
  homeRuns: 0, runs: 0, earnedRuns: 0, walks: 0, intentionalWalks: 0, hitByPitch: 0,
  strikeouts: 0, sacrificeBunts: 0, stolenBases: 0, wildPitches: 0, battersFaced: 0,
  pitches: 0, completeGames: 0, shutouts: 0, noHitters: 0, perfectGames: 0,
  qualityStarts: 0, qualityStartsPlus: 0, noHitNoRuns: 0,
});
export const emptyTeamRecord = (): TeamRecord => ({ games: 0, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0 });
export const innings = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
export const era = (stats: Pick<PitchingStats, "earnedRuns" | "outs">): number | null => stats.outs ? stats.earnedRuns * 27 / stats.outs : null;
export const eraLabel = (stats: Pick<PitchingStats, "earnedRuns" | "outs">) => era(stats)?.toFixed(2) ?? (stats.earnedRuns ? "∞" : "—");
export const whipLabel = (stats: PitchingStats) => stats.outs ? ((stats.hits + stats.walks) * 3 / stats.outs).toFixed(2) : "—";
export const combinedWalks = (stats: PitchingStats) => stats.walks + stats.hitByPitch;
export const kPerNine = (stats: PitchingStats) => stats.outs ? stats.strikeouts * 27 / stats.outs : null;
export const kPerNineLabel = (stats: PitchingStats) => kPerNine(stats)?.toFixed(2) ?? "—";
export function addPitchingStats(...lines: PitchingStats[]): PitchingStats {
  const total = emptyPitchingStats();
  for (const line of lines) for (const key of Object.keys(total) as (keyof PitchingStats)[]) total[key] += line[key];
  return total;
}
export const currentSeasonStats = (state: PitcherState) => state.game?.phase === "PITCHING" ? addPitchingStats(state.stats, state.game.stats) : state.stats;
export const careerStats = (state: PitcherState) => addPitchingStats(...state.history.map((season) => season.stats), currentSeasonStats(state));
export const battingTeam = (game: PitchGame) => game.half === "TOP" ? game.fixture.away : game.fixture.home;
export const fieldingTeam = (game: PitchGame) => game.half === "TOP" ? game.fixture.home : game.fixture.away;
export const currentBatter = (state: PitcherState, game = state.game!) => state.dataset.teams[battingTeam(game)].hitters[game.battingIndex[battingTeam(game)] % 9];
export const isUserPitching = (state: PitcherState, game = state.game!) => game.phase === "PITCHING" && game.userActive && fieldingTeam(game) === state.config.teamId;

export function forcedHomeRunRemaining(state: PitcherState): number {
  const game = state.game;
  if (!game || game.phase !== "PITCHING") return 0;
  if (state.eraRestriction?.remaining) return state.eraRestriction.remaining;
  if (state.eraRestriction?.cooldownFixtureId === game.fixture.id) return 0;
  const stats = currentSeasonStats(state);
  return stats.outs > 300 && stats.earnedRuns * 27 <= (state.config.targetEra - .5) * stats.outs + 1e-10 ? 3 : 0;
}

export function syncEraRestriction(state: PitcherState): void {
  const remaining = forcedHomeRunRemaining(state);
  if (remaining && !state.eraRestriction?.remaining) state.eraRestriction = { remaining };
}

export const choiceLabels: Record<PitchChoice, string> = {
  OUT: "범타", "1B": "안타", "2B": "2루타", "3B": "3루타", HR: "홈런", BB: "볼넷",
  IBB: "고의사구", HBP: "사구", K: "삼진", SH: "희생번트", SB: "도루", WP: "폭투", CS: "도루실패 or 견제사",
};

export function disabledReason(state: PitcherState, choice: PitchChoice): string | null {
  const game = state.game;
  if (!game || !isUserPitching(state, game)) return "현재 투구 중이 아닙니다.";
  if (forcedHomeRunRemaining(state) > 0 && choice !== "HR") return "최저 방어율 제한으로 3타석 연속 홈런을 먼저 선택해야 합니다.";
  if (choice === "SH" && (game.outs >= 2 || game.bases[2] || !(game.bases[0] || game.bases[1]))) return "0·1사, 1·2루 주자와 비어 있는 3루가 필요합니다.";
  if (choice === "SB" && !stealBase(game)) return "도루할 주자와 비어 있는 다음 베이스가 필요합니다.";
  if (choice === "WP" && !game.bases.some(Boolean)) return "진루할 주자가 필요합니다.";
  if (choice === "CS" && !game.bases.some(Boolean)) return "도루실패 또는 견제사로 아웃될 주자가 필요합니다.";
  return null;
}

export function createPitcherSchedule(dataset: PitcherDataset, year: number, seed: number): Fixture[] {
  const ids = Object.keys(dataset.teams);
  const days = dataset.league === "KBO" ? kboSchedule(ids as KboTeamId[], year, seed) : mlbSchedule(ids as MlbTeamId[], year, seed);
  return days.flatMap((day) => day.games.map((fixture) => ({ id: fixture.id, day: fixture.day, home: fixture.home, away: fixture.away, date: fixture.date })));
}

export function validatePitcherConfig(config: PitcherConfig, dataset: PitcherDataset): void {
  if (!config || typeof config !== "object" || typeof config.playerName !== "string" || typeof config.teamId !== "string") throw new Error("선수 설정이 올바르지 않습니다.");
  if (config.league !== dataset.league || config.dataId !== dataset.id || !dataset.teams[config.teamId]) throw new Error("리그·시즌 데이터·소속 팀을 다시 선택해 주세요.");
  if (!config.playerName.trim() || config.playerName.length > 40) throw new Error("선수 이름은 1–40자로 입력해 주세요.");
  if (!Number.isInteger(config.debutYear) || config.debutYear < 1982 || config.debutYear > 2199) throw new Error("데뷔 연도는 1982–2199년으로 입력해 주세요.");
  if (!Number.isInteger(config.rotationSlot) || config.rotationSlot < 1 || config.rotationSlot > 5) throw new Error("선발 순번은 1–5선발 중 선택해 주세요.");
  if (!Number.isFinite(config.targetEra) || config.targetEra < 0 || config.targetEra > 30) throw new Error("목표 방어율은 0.00–30.00으로 입력해 주세요.");
  if (config.throws !== "L" && config.throws !== "R") throw new Error("투구 손을 선택해 주세요.");
  if (!Number.isInteger(config.seed) || config.seed < 1 || config.seed > 4294967295) throw new Error("Seed는 1–4294967295의 정수여야 합니다.");
}

function freshSeason(config: PitcherConfig, dataset: PitcherDataset, year: number): PitcherState {
  validatePitcherConfig(config, dataset);
  return {
    schemaVersion: 1, gameType: "BEST_PITCHER", config: { ...config, playerName: config.playerName.trim() },
    dataset: structuredClone(dataset), year, rngState: (config.seed ^ Math.imul(year, 7919)) >>> 0,
    schedule: createPitcherSchedule(dataset, year, config.seed), cursor: 0, game: null,
    stats: emptyPitchingStats(), records: Object.fromEntries(Object.keys(dataset.teams).map((id) => [id, emptyTeamRecord()])),
    results: [], history: [], seasonComplete: false,
    nextStartGameNumber: config.rotationSlot, startInterval: 5, leaguePitching: {},
    leaguePitchingSinceGames: Object.fromEntries(Object.keys(dataset.teams).map((id) => [id, 0])),
  };
}

export function createPitcherCareer(config: PitcherConfig, dataset: PitcherDataset): PitcherState {
  const state = freshSeason(config, dataset, config.debutYear);
  seekNextStart(state, new SeededRng(state.rngState));
  return state;
}

function log(game: PitchGame, text: string, kind: "choice" | "auto" | "system" = "auto", details: Pick<PitchLogDetails, "important" | "outcome" | "teamId" | "runsScored"> = {}) {
  if (!game.controlled) return;
  game.log.push({ id: game.nextLogId++, inning: game.inning, half: game.half, text, kind, ...details });
  if (game.log.length > 240) game.log.splice(0, game.log.length - 240);
}

type PitchLogDetails = { important?: boolean; outcome?: PitchChoice; teamId?: string; runsScored?: number };

function createGame(state: PitcherState, fixture: Fixture, controlled: boolean): PitchGame {
  const game: PitchGame = {
    fixture, inning: 1, half: "TOP", outs: 0, bases: [null, null, null],
    score: { [fixture.home]: 0, [fixture.away]: 0 }, hits: { [fixture.home]: 0, [fixture.away]: 0 },
    lineScore: { [fixture.home]: [], [fixture.away]: [] }, battingIndex: { [fixture.home]: 0, [fixture.away]: 0 },
    stats: { ...emptyPitchingStats(), games: controlled ? 1 : 0, starts: controlled ? 1 : 0 },
    userActive: controlled, userWinEligible: controlled, controlled, phase: "PITCHING", decision: "ND", log: [], nextLogId: 1, streaks: { strikeouts: 0, outBatters: 0 },
  };
  game.pitching = { active: {}, lines: {} };
  for (const teamId of [fixture.home, fixture.away]) {
    const pitcherId = controlled && teamId === state.config.teamId ? USER_PITCHER_ID : starter(state, teamId).id;
    const key = pitcherKey(teamId, pitcherId);
    game.pitching.active[teamId] = key;
    game.pitching.lines[key] = { teamId, pitcherId, stats: { ...emptyPitchingStats(), games: 1, starts: 1 } };
  }
  log(game, `${state.config.playerName}, ${state.dataset.teams[state.config.teamId].shortName} 선발 등판.`, "system");
  return game;
}

export const USER_PITCHER_ID = "USER-PITCHER";
export const pitcherKey = (teamId: string, pitcherId: string) => `${teamId}:${pitcherId}`;

function activePitcher(state: PitcherState, game: PitchGame) {
  const teamId = fieldingTeam(game);
  const ledger = game.pitching;
  if (!ledger) return undefined; // Old saves resume their unfinished start without inventing earlier pitches.
  let line = ledger.lines[ledger.active[teamId]];
  const team = state.dataset.teams[teamId];
  const profile = team.pitchers.find((pitcher) => pitcher.id === line.pitcherId);
  const replaceUser = line.pitcherId === USER_PITCHER_ID && !game.userActive;
  const replaceStarter = profile?.role === "SP" && (line.stats.pitches >= 90 + profile.stamina * .4 || line.stats.runs >= 5 || (line.stats.outs >= 24 && (line.stats.hits > 0 || line.stats.runs > 0)));
  if (replaceUser || replaceStarter) {
    const relief = team.pitchers.find((pitcher) => pitcher.role !== "SP");
    if (relief) {
      const key = pitcherKey(teamId, relief.id);
      ledger.lines[key] ??= { teamId, pitcherId: relief.id, stats: { ...emptyPitchingStats(), games: 1 } };
      ledger.active[teamId] = key;
      line = ledger.lines[key];
    }
  }
  return line;
}

/** Count final achievements only after inherited runners have finished scoring. */
export function finalizePitchingMilestones(stats: PitchingStats) {
  stats.qualityStarts = Number(stats.starts > 0 && stats.outs >= 18 && stats.runs <= 3);
  stats.qualityStartsPlus = Number(stats.starts > 0 && stats.outs >= 21 && stats.runs <= 3);
  stats.noHitNoRuns = Number(stats.noHitters > 0 && stats.runs === 0);
}

function starter(state: PitcherState, teamId: string): PitcherProfile {
  const team = state.dataset.teams[teamId];
  const starters = team.pitchers.filter((pitcher) => pitcher.role === "SP");
  return starters[state.records[teamId].games % Math.min(5, starters.length)];
}

function autoChoice(state: PitcherState, game: PitchGame, rng: SeededRng): PitchChoice {
  const batter = currentBatter(state, game);
  const team = fieldingTeam(game);
  const line = activePitcher(state, game);
  const profile = state.dataset.teams[team].pitchers.find((pitcher) => pitcher.id === line?.pitcherId) ?? (game.inning <= 6 ? starter(state, team) : state.dataset.teams[team].pitchers.find((pitcher) => pitcher.role !== "SP") ?? starter(state, team));
  return randomPlateAppearance(batter, profile, rng);
}

function randomPlateAppearance(batter: PitcherHitter, pitcher: PitcherProfile, rng: SeededRng): PitchChoice {
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
  const profile = batter.statProfile;
  const pa = profile?.plateAppearances ?? Math.max(1, (profile?.games ?? 144) * 4.1);
  const walk = clamp(profile?.walks !== undefined ? profile.walks / pa : .055 + (batter.discipline - pitcher.control + 35) / 1000, .025, .15);
  const hr = clamp((profile ? profile.homeRuns / pa : .025 + (batter.power - 55) / 2000) + (72 - pitcher.movement) / 4000, .004, .07);
  const hit = clamp((profile?.avg ?? (.25 + (batter.contact - 55) / 700)) * (1 - walk - .01) + (72 - pitcher.stuff) / 1500, .14, .36);
  const strikeout = clamp(profile?.strikeouts !== undefined ? profile.strikeouts / pa : .20 + (pitcher.stuff - batter.contact) / 1000, .08, .36);
  const double = clamp(profile?.doubles !== undefined ? profile.doubles / pa : .045, .015, .075);
  const triple = clamp(profile?.triples !== undefined ? profile.triples / pa : .004, .001, .014);
  const roll = rng.next();
  let cumulative = 0;
  for (const [choice, probability] of [["BB", walk], ["HBP", .008], ["HR", hr], ["3B", triple], ["2B", double], ["1B", Math.max(.02, hit - hr - triple - double)], ["K", strikeout]] as [PitchChoice, number][]) {
    cumulative += probability;
    if (roll < cumulative) return choice;
  }
  return "OUT";
}

function recordOuts(state: PitcherState, game: PitchGame, count = 1) {
  const actual = Math.min(count, 3 - game.outs);
  game.outs += actual;
  if (isUserPitching(state, game)) game.stats.outs += actual;
  const ledger = game.pitching;
  if (ledger) ledger.lines[ledger.active[fieldingTeam(game)]].stats.outs += actual;
}

function scoreRunner(state: PitcherState, game: PitchGame, runner: Runner, homeRun = false) {
  const team = battingTeam(game);
  const other = fieldingTeam(game);
  if (!homeRun && game.inning >= 9 && team === game.fixture.home && game.score[team] > game.score[other]) return false;
  game.score[team]++;
  const inningIndex = game.inning - 1;
  game.lineScore[team][inningIndex] = (game.lineScore[team][inningIndex] ?? 0) + 1;
  if (game.controlled && runner.responsibleUser) {
    game.stats.runs++;
    if (runner.earned) game.stats.earnedRuns++;
  }
  const responsibleKey = runner.pitcherKey ?? (runner.responsibleUser ? pitcherKey(state.config.teamId, USER_PITCHER_ID) : undefined);
  const pitching = responsibleKey ? game.pitching?.lines[responsibleKey]?.stats : undefined;
  if (pitching) { pitching.runs++; if (runner.earned) pitching.earnedRuns++; }
  if (game.score[team] === game.score[other] + 1) {
    game.goAhead = { team, winUser: team === state.config.teamId && game.userWinEligible, lossUser: team !== state.config.teamId && runner.responsibleUser, winnerKey: game.pitching?.active[team], loserKey: responsibleKey };
  }
  return true;
}

function stealBase(game: PitchGame): 1 | 2 | null {
  if (game.bases[1] && !game.bases[2]) return 2;
  if (game.bases[0] && !game.bases[1]) return 1;
  return null;
}

function applyPlay(state: PitcherState, game: PitchGame, choice: PitchChoice, rng: SeededRng, selected = false) {
  const user = isUserPitching(state, game);
  const pitching = activePitcher(state, game)?.stats;
  const updateStats = (key: keyof PitchingStats, count = 1) => { if (user) game.stats[key] += count; if (pitching) pitching[key] += count; };
  // Once the bullpen faces an opponent, a new lead can no longer give the departed starter a win.
  if (game.controlled && !game.userActive && fieldingTeam(game) === state.config.teamId) game.userWinEligible = false;
  const batter = currentBatter(state, game);
  const kind = selected ? "choice" : "auto";
  const beforeScore = game.score[battingTeam(game)];
  const scored: string[] = [];
  const score = (runner: Runner, homeRun = false) => { if (scoreRunner(state, game, runner, homeRun)) scored.push(runner.name); };
  const recordPlay = (detail: string) => {
    const runsScored = game.score[battingTeam(game)] - beforeScore;
    const scoringText = runsScored ? ` ${runsScored}점 ${choice === "HR" ? "홈런" : choice === "BB" || choice === "IBB" || choice === "HBP" ? "밀어내기 득점" : "득점"}! ${scored.join(" · ")} 득점. (${state.dataset.teams[game.fixture.away].shortName} ${game.score[game.fixture.away]} : ${game.score[game.fixture.home]} ${state.dataset.teams[game.fixture.home].shortName})` : "";
    log(game, `${detail}${scoringText}`, kind, { important: runsScored > 0 || ["2B", "3B", "HR"].includes(choice), outcome: choice, teamId: battingTeam(game), runsScored });
  };
  if (choice === "SB") {
    const target = stealBase(game);
    if (target === null) throw new Error("도루할 주자가 없습니다.");
    const runner = game.bases[target - 1]!;
    game.bases[target] = runner;
    game.bases[target - 1] = null;
    updateStats("stolenBases");
    recordPlay(`${runner.name}, ${target + 1}루 도루 성공. 타석은 계속됩니다.`);
    return;
  }
  if (choice === "CS") {
    const base = game.bases[2] ? 2 : game.bases[1] ? 1 : game.bases[0] ? 0 : null;
    if (base === null) throw new Error("아웃될 주자가 없습니다.");
    const runner = game.bases[base]!;
    game.bases[base] = null;
    const pickedOff = rng.chance(.5);
    recordOuts(state, game);
    if (!pickedOff) updateStats("pitches");
    recordPlay(`${runner.name}, ${pickedOff ? `${base + 1}루 견제사` : "도루실패"} 아웃.${game.outs < 3 ? " 타석은 계속됩니다." : " 이닝 종료."}`);
    return;
  }
  if (choice === "WP") {
    const [first, second, third] = game.bases;
    if (third) score(third);
    game.bases = [null, first, second];
    updateStats("wildPitches"); updateStats("pitches");
    recordPlay("폭투. 모든 주자 한 베이스 진루. 타석은 계속됩니다.");
    return;
  }

  const runner: Runner = { id: batter.id, name: batter.name, responsibleUser: user, earned: true, pitcherKey: game.pitching?.active[fieldingTeam(game)] };
  updateStats("battersFaced");
  const pitches = choice === "IBB" ? 0 : user ? choice === "BB" ? rng.int(4, 7) : choice === "K" ? rng.int(3, 6) : rng.int(1, 5) : choice === "BB" || choice === "K" ? 4 : 3;
  updateStats("pitches", pitches);
  if (user) {
    game.streaks.strikeouts = choice === "K" ? game.streaks.strikeouts + 1 : 0;
    game.streaks.outBatters = choice === "K" || choice === "OUT" || choice === "SH" ? game.streaks.outBatters + 1 : 0;
  }
  const [first, second, third] = game.bases;
  let detail = choiceLabels[choice];
  if (choice === "BB" || choice === "IBB" || choice === "HBP") {
    if (first && second && third) score(third);
    game.bases = [runner, first ?? second, first && second ? second : third];
    if (choice === "HBP") updateStats("hitByPitch");
    else { updateStats("walks"); if (choice === "IBB") updateStats("intentionalWalks"); }
  } else if (choice === "HR" || choice === "3B" || choice === "2B" || choice === "1B") {
    game.hits[battingTeam(game)]++;
    updateStats("hits");
    if (choice === "HR") updateStats("homeRuns");
    if (choice === "2B") updateStats("doubles");
    if (choice === "3B") updateStats("triples");
    if (choice === "HR") {
      for (const item of [third, second, first, runner]) if (item) score(item, true);
      game.bases = [null, null, null];
    } else if (choice === "3B") {
      for (const item of [third, second, first]) if (item) score(item);
      game.bases = [null, null, runner];
    } else if (choice === "2B") {
      if (third) score(third);
      if (second) score(second);
      const firstScores = Boolean(first && rng.chance(.45));
      if (first && firstScores) score(first);
      game.bases = [null, runner, firstScores ? null : first];
    } else {
      if (third) score(third);
      const secondScores = Boolean(second && rng.chance(.65));
      if (second && secondScores) score(second);
      const thirdBase = second && !secondScores ? second : null;
      const firstToThird = Boolean(first && !thirdBase && rng.chance(.25));
      game.bases = [runner, firstToThird ? null : first, thirdBase ?? (firstToThird ? first : null)];
    }
  } else if (choice === "K") {
    recordOuts(state, game);
    updateStats("strikeouts");
  } else if (choice === "SH") {
    recordOuts(state, game);
    game.bases = [null, first, second];
    updateStats("sacrificeBunts");
    detail = "희생번트 아웃 · 주자 한 베이스 진루";
  } else {
    const ground = rng.chance(.5);
    if (ground && first && game.outs < 2 && rng.chance(.38)) {
      recordOuts(state, game, 2);
      game.bases[0] = null;
      detail = "병살타";
      if (game.outs < 3) {
        if (third) score(third);
        game.bases = [null, null, second];
      }
    } else {
      recordOuts(state, game);
      detail = `${ground ? "땅볼" : rng.chance(.7) ? "뜬공" : "직선타"} 아웃`;
      if (game.outs < 3 && rng.chance(ground ? .4 : .22)) {
        if (third) score(third);
        if (ground) game.bases = [null, first, second];
        else game.bases[2] = null;
        detail += " · 주자 진루";
      }
    }
  }
  recordPlay(`${batter.name}, ${detail}.`);
  game.battingIndex[battingTeam(game)] = (game.battingIndex[battingTeam(game)] + 1) % 9;
}

function checkGameEnd(state: PitcherState, game: PitchGame): boolean {
  const { home, away } = game.fixture;
  if (game.inning >= 9 && game.half === "BOTTOM" && game.score[home] > game.score[away]) return true;
  if (game.outs < 3) return false;
  if (game.inning >= 9 && game.half === "TOP" && game.score[home] > game.score[away]) return true;
  if (game.inning >= 9 && game.half === "BOTTOM" && game.score[home] !== game.score[away]) return true;
  return state.config.league === "KBO" && game.inning >= 12 && game.half === "BOTTOM";
}

function nextHalf(state: PitcherState, game: PitchGame) {
  const team = battingTeam(game);
  game.lineScore[team][game.inning - 1] ??= 0;
  log(game, `${game.inning}회${game.half === "TOP" ? "초" : "말"} 종료 · ${state.dataset.teams[game.fixture.away].shortName} ${game.score[game.fixture.away]} : ${game.score[game.fixture.home]} ${state.dataset.teams[game.fixture.home].shortName}`, "system");
  if (game.half === "TOP") game.half = "BOTTOM";
  else { game.half = "TOP"; game.inning++; }
  game.outs = 0;
  game.bases = [null, null, null];
  if (state.config.league === "MLB" && game.inning >= 10) {
    const hitters = state.dataset.teams[battingTeam(game)].hitters;
    const previous = hitters[(game.battingIndex[battingTeam(game)] + 8) % 9];
    activePitcher(state, game);
    game.bases[1] = { id: previous.id, name: previous.name, responsibleUser: isUserPitching(state, game), earned: false, pitcherKey: game.pitching?.active[fieldingTeam(game)] };
    log(game, `연장 승부치기 · ${previous.name} 2루에서 시작. 자동 주자는 비자책으로 기록합니다.`, "system");
  }
}

function recordResult(state: PitcherState, game: PitchGame) {
  const { home, away } = game.fixture;
  for (const [team, other] of [[home, away], [away, home]]) {
    const record = state.records[team];
    record.games++;
    record.runsFor += game.score[team];
    record.runsAgainst += game.score[other];
    if (game.score[team] > game.score[other]) record.wins++;
    else if (game.score[team] < game.score[other]) record.losses++;
    else record.ties++;
  }
  const pitching = game.pitching?.lines;
  if (pitching) for (const [key, line] of Object.entries(pitching)) state.leaguePitching[key] = addPitchingStats(state.leaguePitching[key] ?? emptyPitchingStats(), line.stats);
  state.results.push({ fixture: game.fixture, homeScore: game.score[home], awayScore: game.score[away], controlled: game.controlled, ...(game.controlled ? { stats: { ...game.stats }, decision: game.decision } : {}), ...(pitching ? { pitching: structuredClone(pitching) } : {}) });
  if (game.controlled) state.stats = addPitchingStats(state.stats, game.stats);
  state.cursor++;
}

function finishGame(state: PitcherState, game: PitchGame) {
  game.lineScore[battingTeam(game)][game.inning - 1] ??= 0;
  game.phase = "FINISHED";
  if (game.controlled) {
    const own = state.config.teamId;
    const opponent = own === game.fixture.home ? game.fixture.away : game.fixture.home;
    if (game.score[own] > game.score[opponent] && game.goAhead?.team === own && game.goAhead.winUser && game.stats.outs >= 15) { game.decision = "W"; game.stats.wins = 1; }
    else if (game.score[own] < game.score[opponent] && game.goAhead?.team === opponent && game.goAhead.lossUser) { game.decision = "L"; game.stats.losses = 1; }
    if (game.userActive) {
      game.stats.completeGames = 1;
      if (game.score[opponent] === 0 && game.score[own] > game.score[opponent]) game.stats.shutouts = 1;
      // Nine complete innings are required; an eight-inning road loss is not a no-hitter.
      if (game.stats.outs >= 27 && game.stats.hits === 0) {
        game.stats.noHitters = 1;
        if (game.stats.runs === 0 && game.stats.walks === 0 && game.stats.hitByPitch === 0 && game.stats.battersFaced === game.stats.outs) game.stats.perfectGames = 1;
      }
    }
    finalizePitchingMilestones(game.stats);
    log(game, `경기 종료 · ${game.decision === "W" ? "승리투수" : game.decision === "L" ? "패전투수" : "승패 없음"} · ${innings(game.stats.outs)}이닝 ${game.stats.earnedRuns}자책 ${game.stats.strikeouts}삼진${game.stats.perfectGames ? " · 퍼펙트게임!" : game.stats.noHitters ? " · 노히트 게임!" : ""}`, "system");
  }
  finalizeLeaguePitching(state, game);
  recordResult(state, game);
}

function finalizeLeaguePitching(state: PitcherState, game: PitchGame) {
  const ledger = game.pitching;
  if (!ledger) return;
  const { home, away } = game.fixture;
  const winner = game.score[home] === game.score[away] ? null : game.score[home] > game.score[away] ? home : away;
  const loser = winner === home ? away : home;
  const lines = Object.entries(ledger.lines);
  if (winner) {
    let winnerKey = game.goAhead?.winnerKey;
    const candidate = winnerKey ? ledger.lines[winnerKey] : undefined;
    if (!candidate || candidate.teamId !== winner || (candidate.stats.starts > 0 && candidate.stats.outs < 15) || (candidate.pitcherId === USER_PITCHER_ID && game.decision !== "W")) {
      winnerKey = lines.filter(([, line]) => line.teamId === winner && line.stats.starts === 0 && line.stats.outs > 0).sort((a, b) => b[1].stats.outs - a[1].stats.outs)[0]?.[0];
    }
    if (winnerKey) ledger.lines[winnerKey].stats.wins = 1;
    const loserKey = game.goAhead?.loserKey;
    if (loserKey && ledger.lines[loserKey]?.teamId === loser) ledger.lines[loserKey].stats.losses = 1;
  }
  for (const [, line] of lines) {
    const stats = line.stats;
    const complete = stats.starts > 0 && lines.filter(([, other]) => other.teamId === line.teamId).length === 1;
    stats.completeGames = Number(complete);
    stats.shutouts = Number(complete && line.teamId === winner && game.score[line.teamId === home ? away : home] === 0);
    stats.noHitters = Number(complete && stats.outs >= 27 && stats.hits === 0);
    stats.perfectGames = Number(stats.noHitters > 0 && stats.runs === 0 && stats.walks === 0 && stats.hitByPitch === 0 && stats.battersFaced === stats.outs);
    finalizePitchingMilestones(stats);
    if (line.pitcherId === USER_PITCHER_ID) line.stats = { ...game.stats };
  }
}

function progress(state: PitcherState, game: PitchGame) {
  if (checkGameEnd(state, game)) { finishGame(state, game); return; }
  if (game.outs >= 3) nextHalf(state, game);
}

function runAutomatic(state: PitcherState, game: PitchGame, rng: SeededRng) {
  let steps = 0;
  while (game.phase !== "FINISHED" && !isUserPitching(state, game)) {
    if (++steps > 5000) throw new Error("자동 진행 한도를 초과했습니다. 이전 저장을 불러와 주세요.");
    applyPlay(state, game, autoChoice(state, game, rng), rng);
    progress(state, game);
  }
  state.rngState = rng.state;
}

function seekNextStart(state: PitcherState, rng: SeededRng) {
  while (state.cursor < state.schedule.length) {
    const fixture = state.schedule[state.cursor];
    const ownGame = fixture.home === state.config.teamId || fixture.away === state.config.teamId;
    const controlled = ownGame && state.records[state.config.teamId].games + 1 >= state.nextStartGameNumber;
    const game = createGame(state, fixture, controlled);
    if (controlled) { state.game = game; runAutomatic(state, game, rng); syncEraRestriction(state); return; }
    runAutomatic(state, game, rng);
  }
  state.seasonComplete = true;
  state.rngState = rng.state;
}

export function applyPitchChoice(previous: PitcherState, choice: PitchChoice): PitcherState {
  const reason = disabledReason(previous, choice);
  if (reason) throw new Error(reason);
  if (!(choice in choiceLabels)) throw new Error("지원하지 않는 결과입니다.");
  const state = structuredClone(previous);
  const game = state.game!;
  syncEraRestriction(state);
  if (state.eraRestriction?.remaining) {
    state.eraRestriction.remaining--;
    if (state.eraRestriction.remaining === 0) state.eraRestriction.cooldownFixtureId = game.fixture.id;
  }
  game.focusLogId = game.nextLogId;
  const rng = new SeededRng(state.rngState);
  applyPlay(state, game, choice, rng, true);
  progress(state, game);
  runAutomatic(state, game, rng);
  syncEraRestriction(state);
  return state;
}

export function relievePitcher(previous: PitcherState): PitcherState {
  if (!previous.game || !isUserPitching(previous)) throw new Error("현재 선발투수가 등판 중이 아닙니다.");
  if (forcedHomeRunRemaining(previous) > 0) throw new Error("강제 홈런 선택을 먼저 마쳐 주세요.");
  const state = structuredClone(previous);
  const game = state.game!;
  game.exit = { inning: game.inning, half: game.half, outs: game.outs, pitches: game.stats.pitches, score: `${game.score[game.fixture.away]}–${game.score[game.fixture.home]}` };
  game.userActive = false;
  log(game, `${state.config.playerName} 교체 · 남긴 주자가 득점하면 선발투수의 실점·자책에 반영됩니다.`, "system");
  runAutomatic(state, game, new SeededRng(state.rngState));
  return state;
}

export function nextPitcherStart(previous: PitcherState, interval: StartInterval = 5): PitcherState {
  if (previous.game?.phase !== "FINISHED" || previous.seasonComplete) throw new Error("현재 경기를 먼저 끝내 주세요.");
  if (![3, 4, 5].includes(interval)) throw new Error("3·4·5경기 후 등판 중 선택해 주세요.");
  const state = structuredClone(previous);
  state.startInterval = interval;
  state.nextStartGameNumber = state.records[state.config.teamId].games + interval;
  seekNextStart(state, new SeededRng(state.rngState));
  return state;
}

export function nextPitcherSeason(previous: PitcherState, targetEra: number, dataset = previous.dataset): PitcherState {
  if (!previous.seasonComplete) throw new Error("정규시즌을 먼저 마무리해 주세요.");
  if (previous.year >= 2199) throw new Error("커리어 연도는 2199년까지 지원합니다.");
  const config = { ...previous.config, targetEra, dataId: dataset.id };
  const state = freshSeason(config, dataset, previous.year + 1);
  state.history = [...previous.history, { year: previous.year, league: previous.config.league, teamName: previous.dataset.teams[previous.config.teamId].name, targetEra: previous.config.targetEra, stats: { ...previous.stats }, record: { ...previous.records[previous.config.teamId] } }];
  seekNextStart(state, new SeededRng(state.rngState));
  return state;
}
