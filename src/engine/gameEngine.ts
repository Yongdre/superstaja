import { recordCareerMilestones, validateCareerMilestones, walkOffText } from "./achievements";
import { careerStats } from "./career";
import { forcedNoHitRemaining, recordUserGame, restoreTeamStreaks, syncBattingRestriction } from "./milestones";
import { effectivePitcher, ensurePitchingHistory, pitchingAwards, recordPitcherWorkload, remainingWorkload } from "./pitching";
import { defaultLeagueDataset, supportedTeamIds, validateLeagueDataset } from "../data/leagueDataset";
import { simulationConfig } from "../data/simulationConfig";
import { attemptSteal, automaticStealPlan } from "./baserunning";
import { buildSeasonLineupPlan } from "./lineup";
import { canChooseSacrifice, resolvePlateAppearance } from "./plateAppearance";
import {
  advancePostseasonSeries,
  createPostseason,
  isSeriesClinched,
  postseasonFixture,
  postseasonBattingBySeries,
  recordPostseasonResult,
  seriesIncludes,
} from "./postseason";
import { SeededRng } from "./rng";
import { generateSchedule } from "./schedule";
import { emptyBatterStats } from "./statistics";
import { recordGame } from "./standings";
import { userFieldPositions } from "./types";
import type {
  BatterStats,
  CareerState,
  CompetitionStage,
  DaySchedule,
  GameFixture,
  GameState,
  GameSummary,
  HeadToHeadRecord,
  HitterProfile,
  LeagueDataset,
  PitcherGameState,
  PitcherProfile,
  SeasonConfig,
  SeasonGoals,
  SeasonState,
  TeamId,
  TeamRecord,
  UserChoice,
} from "./types";

const userProfile = (config: SeasonConfig): HitterProfile => ({
  id: "USER-PLAYER",
  name: config.playerName,
  position: config.position,
  bats: "R",
  contact: 70,
  power: 68,
  discipline: 66,
  speed: 76,
});

const clone = <T,>(value: T): T => structuredClone(value);

const blankRecord = (): TeamRecord => ({
  games: 0, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, homeGames: 0, awayGames: 0,
});

const recordForAllTeams = <T,>(factory: (teamId: TeamId) => T): Record<TeamId, T> =>
  Object.fromEntries(supportedTeamIds.map((teamId) => [teamId, factory(teamId)])) as Record<TeamId, T>;

function lineupFor(teamId: TeamId, day: number, season: number, config: SeasonConfig, leagueData: LeagueDataset): string[] {
  const userTeam = teamId === config.userTeam;
  const lineupPlan = buildSeasonLineupPlan(leagueData.teams[teamId], season, userTeam ? config.position : undefined);
  const lineup = [...lineupPlan[day % lineupPlan.length]];
  if (userTeam) lineup.splice(config.battingOrder - 1, 0, "USER-PLAYER");
  return lineup;
}

function getHitter(id: string, config: SeasonConfig, leagueData: LeagueDataset): HitterProfile {
  if (id === "USER-PLAYER") return userProfile(config);
  for (const team of Object.values(leagueData.teams)) {
    const hitter = team.hitters.find((candidate) => candidate.id === id);
    if (hitter) return hitter;
  }
  throw new Error(`선수 데이터를 찾을 수 없습니다: ${id}`);
}

export function starterFor(teamId: TeamId, day: number, leagueData: LeagueDataset, competition: CompetitionStage = "REGULAR_SEASON") {
  const allStarters = leagueData.teams[teamId].pitchers.filter((pitcher) => pitcher.role === "SP");
  const starters = competition === "REGULAR_SEASON" ? allStarters : allStarters.slice(0, 4);
  if (!starters.length) throw new Error(`${leagueData.teams[teamId].name}의 선발투수가 없습니다.`);
  if (competition !== "REGULAR_SEASON") return starters[day % starters.length];
  if (starters.every((pitcher) => !pitcher.statProfile)) return starters[day % starters.length];
  const weights = starters.map((pitcher) => Math.max(0.1, pitcher.statProfile?.gamesStarted ?? ((pitcher.statProfile?.innings ?? 162) / 5.8)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const appearances = starters.map(() => 0);
  let selectedIndex = 0;
  for (let game = 0; game <= day; game += 1) {
    selectedIndex = weights.reduce((best, weight, index) => {
      const deficit = weight / totalWeight * (game + 1) - appearances[index];
      const bestDeficit = weights[best] / totalWeight * (game + 1) - appearances[best];
      return deficit > bestDeficit ? index : best;
    }, 0);
    appearances[selectedIndex] += 1;
  }
  return starters[selectedIndex];
}

function makePitcherState(teamId: TeamId, day: number, leagueData: LeagueDataset, competition: CompetitionStage): PitcherGameState {
  const rotationIndex = day;
  const starter = starterFor(teamId, rotationIndex, leagueData, competition);
  return {
    pitcherId: starter.id,
    name: starter.name,
    pitchCount: 0,
    runsAllowed: 0,
    outsRecorded: 0,
    battersFaced: 0,
    bullpenIndex: 0,
    isStarter: true,
    usedPitcherIds: [starter.id],
  };
}

export function createGame(state: SeasonState, fixture: GameFixture, competition: CompetitionStage = "REGULAR_SEASON", rotationIndex?: number): GameState {
  const score = recordForAllTeams(() => 0);
  const lineScore = recordForAllTeams(() => [] as number[]);
  const battingIndex = recordForAllTeams(() => 0);
  const lineups = recordForAllTeams((teamId) => lineupFor(teamId, fixture.day, state.season, state.config, state.leagueData));
  const pitchers = recordForAllTeams((teamId) => {
    // 대기 팀은 1선발부터, 이전 시리즈를 치른 팀은 자신의 누적 경기 수부터 순환합니다.
    const teamGameCount = competition === "REGULAR_SEASON" ? fixture.day
      : (state.postseason?.games.filter(({ summary }) => summary.away === teamId || summary.home === teamId).length ?? 0);
    return makePitcherState(teamId, rotationIndex ?? teamGameCount, state.leagueData, competition);
  });
  return {
    fixture,
    competition,
    inning: 1,
    half: "TOP",
    outs: 0,
    bases: [null, null, null],
    score,
    lineScore,
    battingIndex,
    lineups,
    pitchers,
    phase: "SIMULATING",
    log: [{ id: 1, inning: 1, half: "TOP", text: `${state.leagueData.teams[fixture.away].name} vs ${state.leagueData.teams[fixture.home].name}, 경기 시작.`, important: true }],
    nextLogId: 2,
    userGameStats: emptyBatterStats(),
    finalized: false,
  };
}

function addEngineLog(game: GameState, text: string, important = false) {
  game.log.push({ id: game.nextLogId++, inning: game.inning, half: game.half, text, important });
  if (game.log.length > simulationConfig.logLimit) game.log.splice(0, game.log.length - simulationConfig.logLimit);
}

const battingTeam = (game: GameState) => game.half === "TOP" ? game.fixture.away : game.fixture.home;
const fieldingTeam = (game: GameState) => game.half === "TOP" ? game.fixture.home : game.fixture.away;
const isFinished = (game: GameState) => game.phase === "GAME_END_TRANSITION" || game.phase === "GAME_END" || game.phase === "SEASON_END";

export function activePlayerStats(state: SeasonState) {
  return state.postseason && state.game?.competition !== "REGULAR_SEASON" ? state.postseason.playerStats : state.playerStats;
}

function currentBatter(state: SeasonState, game: GameState): HitterProfile {
  const teamId = battingTeam(game);
  return getHitter(game.lineups[teamId][game.battingIndex[teamId] % 9], state.config, state.leagueData);
}

function currentPitcherProfile(state: SeasonState, game: GameState) {
  const pitcherState = game.pitchers[fieldingTeam(game)];
  const pitcher = Object.values(state.leagueData.teams).flatMap((team) => team.pitchers).find((candidate) => candidate.id === pitcherState.pitcherId);
  return pitcher ?? starterFor(fieldingTeam(game), game.fixture.day, state.leagueData, game.competition);
}

export function eligibleBullpenPitchers(teamId: TeamId, leagueData: LeagueDataset, competition: CompetitionStage = "REGULAR_SEASON") {
  const teamPitchers = leagueData.teams[teamId].pitchers;
  const fifthStarter = competition === "REGULAR_SEASON"
    ? undefined
    : teamPitchers.filter((pitcher) => pitcher.role === "SP")[4];
  return teamPitchers.filter((pitcher) => pitcher.role !== "SP" || pitcher.id === fifthStarter?.id);
}

function usedPitchersFor(state: SeasonState, game: GameState, teamId: TeamId): string[] {
  const current = game.pitchers[teamId];
  if (current.usedPitcherIds) return current.usedPitcherIds;
  const team = state.leagueData.teams[teamId];
  const changes = game.log.filter((entry) => entry.text.startsWith(`${team.shortName}, 투수 교체: `));
  const used = team.pitchers.filter((pitcher) => changes.some((entry) => entry.text === `${team.shortName}, 투수 교체: ${pitcher.name}.`));
  // 오래된 세이브의 중계가 잘려 등판 이력을 복원할 수 없으면 재등판 방지를 우선합니다.
  if (changes.length < current.bullpenIndex) used.push(...eligibleBullpenPitchers(teamId, state.leagueData, game.competition));
  current.usedPitcherIds = [...new Set([current.pitcherId, ...used.map((pitcher) => pitcher.id)])];
  return current.usedPitcherIds;
}

export function checkPitchingChange(state: SeasonState, game: GameState, rng: SeededRng) {
  const defense = fieldingTeam(game);
  const pitcherState = game.pitchers[defense];
  const pitcherProfile = currentPitcherProfile(state, game);
  const minimumReached = pitcherState.outsRecorded >= simulationConfig.starterMinInnings * 3;
  const staminaAdjustment = (pitcherProfile.stamina - 70) * .55;
  const limit = simulationConfig.starterPitchLimit + staminaAdjustment;
  const emergency = pitcherState.pitchCount >= limit + 10 || pitcherState.runsAllowed >= 8
    || (pitcherState.runsAllowed >= 5 && pitcherState.pitchCount >= 40);
  const tired = pitcherState.pitchCount >= limit - rng.int(0, 12);
  const lead = game.score[defense] - game.score[battingTeam(game)];
  const closeGame = Math.abs(lead) <= 3;
  const freshCloser = game.inning >= 9 && lead > 0 && lead <= 3 && game.outs === 0 && pitcherProfile.role !== "CP";
  const reliefLimit = Math.max(20, 24 + (pitcherProfile.stamina - 45) * .6);
  const shortRelief = !pitcherState.isStarter && (pitcherState.pitchCount >= reliefLimit
    || pitcherState.outsRecorded >= 6 || pitcherState.runsAllowed >= 3
    || (game.outs === 0 && pitcherState.outsRecorded >= 3 && game.inning >= 7 && closeGame));
  if (!(pitcherState.isStarter && (emergency || (minimumReached && tired))) && !shortRelief && !freshCloser) return;

  const usedPitcherIds = usedPitchersFor(state, game, defense);
  const bullpen = eligibleBullpenPitchers(defense, state.leagueData, game.competition)
    .filter(p => !usedPitcherIds.includes(p.id) && p.id !== pitcherState.pitcherId);
  if (!bullpen.length) return;
  const restedCloser = bullpen.find(p => p.role === "CP" && remainingWorkload(state, game, p.id) < 25);
  const useCloser = game.inning >= 9 && lead >= 0 && lead <= 3 && restedCloser;
  if (freshCloser && !useCloser && !emergency && !shortRelief && !(pitcherState.isStarter && minimumReached && tired)) return;
  const middle = bullpen.filter(p => p.role !== "CP");
  const candidates = middle.length ? middle : bullpen;
  const leverage = game.inning >= 7 && closeGame;
  const quality = (p: PitcherProfile) => (p.stuff + p.movement + p.control) / 3;
  candidates.sort((a, b) => {
    const score = (p: PitcherProfile) => (leverage ? quality(p) : -quality(p) * .2) - remainingWorkload(state, game, p.id) * 1.2;
    return score(b) - score(a);
  });
  const next = useCloser || candidates[0];
  ensurePitchingHistory(game);
  game.pitchers[defense] = {
    pitcherId: next.id,
    name: next.name,
    pitchCount: 0,
    runsAllowed: 0,
    outsRecorded: 0,
    battersFaced: 0,
    bullpenIndex: pitcherState.bullpenIndex + 1,
    isStarter: false,
    usedPitcherIds: [...usedPitcherIds, next.id],
    entryLead: lead,
    entryTyingRun: lead > 0 && lead <= game.bases.filter(Boolean).length + 2,
    leadLost: false,
  };
  ensurePitchingHistory(game);
  addEngineLog(game, `${state.leagueData.teams[defense].shortName}, 투수 교체: ${next.name}.`, true);
}

function finishGame(game: GameState) {
  game.phase = "GAME_END_TRANSITION";
  game.bases = [null, null, null];
}

function transitionAfterPlay(game: GameState) {
  const awayScore = game.score[game.fixture.away];
  const homeScore = game.score[game.fixture.home];
  if (game.half === "BOTTOM" && game.inning >= 9 && homeScore > awayScore) {
    finishGame(game);
    return;
  }
  if (game.outs < 3) return;

  game.outs = 0;
  game.bases = [null, null, null];
  if (game.half === "TOP") {
    if (game.inning >= 9 && homeScore > awayScore) {
      finishGame(game);
      return;
    }
    game.half = "BOTTOM";
  } else {
    if (game.inning >= 9 && homeScore !== awayScore) {
      finishGame(game);
      return;
    }
    const maxInnings = game.competition === "REGULAR_SEASON" ? simulationConfig.maxInnings : 15;
    if (game.inning >= maxInnings) {
      finishGame(game);
      return;
    }
    game.inning += 1;
    game.half = "TOP";
  }
}

export function maybeAutoSteal(state: SeasonState, game: GameState, rng: SeededRng) {
  const runner = game.bases[0];
  if (!runner || game.bases[1] || game.outs >= 3 || runner.isUser) return;
  const runnerProfile = getHitter(runner.playerId, state.config, state.leagueData);
  const speedGrade = runnerProfile.statProfile?.speed ?? Math.round((runner.speed - 15) / 8);
  const stealPlan = automaticStealPlan(speedGrade);
  if (!stealPlan) return;
  const stats = activePlayerStats(state)[runner.playerId];
  if (stats.sb + stats.cs >= stealPlan.maxAttempts || !rng.chance(stealPlan.attemptChance)) return;
  const result = attemptSteal(game.bases, rng, stealPlan.successProbability);
  game.bases = result.bases;
  if (result.success) {
    stats.sb += 1;
    addEngineLog(game, `${runner.name}, 2루 도루 성공.`, true);
  } else {
    stats.cs += 1;
    game.outs += result.outsAdded;
    game.pitchers[fieldingTeam(game)].outsRecorded += result.outsAdded;
    addEngineLog(game, `${runner.name}, 2루 도루 실패.`, true);
    transitionAfterPlay(game);
  }
}

function playOne(state: SeasonState, game: GameState, rng: SeededRng, userChoice?: UserChoice) {
  const offense = battingTeam(game);
  const defense = fieldingTeam(game);
  const batter = currentBatter(state, game);
  ensurePitchingHistory(game);
  const beforeCareer = batter.id === "USER-PLAYER" && game.competition === "REGULAR_SEASON" ? careerStats(state) : undefined;
  const beforeOuts = game.outs;
  const beforeAwayScore = game.score[game.fixture.away];
  const beforeHomeScore = game.score[game.fixture.home];
  const result = resolvePlateAppearance({
    game,
    batter,
    pitcher: effectivePitcher(state, game, currentPitcherProfile(state, game)),
    battingTeam: offense,
    stats: activePlayerStats(state),
    rng,
    userChoice,
  });
  if (beforeCareer) recordCareerMilestones(state, game, beforeCareer);
  if (game.half === "BOTTOM" && game.inning >= 9 && beforeHomeScore <= beforeAwayScore && game.score[game.fixture.home] > game.score[game.fixture.away]) {
    game.walkOff = { batterId: batter.id, batterName: batter.name, outcome: result.outcome };
    addEngineLog(game, `${walkOffText(result.outcome)} ${batter.name}, ${state.leagueData.teams[game.fixture.home].shortName} 승리!`, true);
  }
  updatePitchingDecision(game, beforeAwayScore, beforeHomeScore);
  game.pitchers[defense].outsRecorded += Math.max(0, game.outs - beforeOuts);
  game.battingIndex[offense] = (game.battingIndex[offense] + 1) % 9;
  transitionAfterPlay(game);
  if (!isFinished(game)) checkPitchingChange(state, game, rng);
}

function leaderForScore(game: GameState, awayScore: number, homeScore: number): TeamId | undefined {
  if (awayScore === homeScore) return undefined;
  return awayScore > homeScore ? game.fixture.away : game.fixture.home;
}

export function updatePitchingDecision(game: GameState, beforeAwayScore: number, beforeHomeScore: number) {
  const awayScore = game.score[game.fixture.away];
  const homeScore = game.score[game.fixture.home];
  const previousLeader = leaderForScore(game, beforeAwayScore, beforeHomeScore);
  const newLeader = leaderForScore(game, awayScore, homeScore);

  if (!newLeader) {
    game.pitchingDecision = undefined;
    return;
  }
  if (newLeader === previousLeader) return;

  const trailingTeam = newLeader === game.fixture.away ? game.fixture.home : game.fixture.away;
  game.pitchingDecision = {
    leadingTeam: newLeader,
    winningPitcher: {
      pitcherId: game.pitchers[newLeader].pitcherId,
      name: game.pitchers[newLeader].name,
    },
    losingPitcher: {
      pitcherId: game.goAheadPitcherId ?? game.pitchers[trailingTeam].pitcherId,
      name: ensurePitchingHistory(game)[game.goAheadPitcherId ?? game.pitchers[trailingTeam].pitcherId]?.name ?? game.pitchers[trailingTeam].name,
    },
  };
}

function runAutomaticGame(state: SeasonState, game: GameState, rng: SeededRng, pauseForUser: boolean) {
  let safety = 0;
  game.phase = "SIMULATING";
  while (game.phase === "SIMULATING" && safety < 1000) {
    safety += 1;
    maybeAutoSteal(state, game, rng);
    if (isFinished(game)) break;
    const batter = currentBatter(state, game);
    if (pauseForUser && batter.id === "USER-PLAYER") {
      game.phase = "USER_AT_BAT";
      syncBattingRestriction(state);
      break;
    }
    playOne(state, game, rng);
  }
  if (safety >= 1000) throw new Error("경기 시뮬레이션 안전 한도를 초과했습니다.");
}

export function makeSummary(game: GameState): GameSummary {
  const awayScore = game.score[game.fixture.away];
  const homeScore = game.score[game.fixture.home];
  const winner = awayScore === homeScore ? null : awayScore > homeScore ? game.fixture.away : game.fixture.home;
  const loser = winner === game.fixture.away ? game.fixture.home : game.fixture.away;
  const decision = winner && game.pitchingDecision?.leadingTeam === winner ? game.pitchingDecision : undefined;
  const awards = winner ? pitchingAwards(game, winner) : { winningPitcher: "-", savePitcher: undefined };
  const winningPitcher = awards.winningPitcher;
  const savePitcher = awards.savePitcher;
  const losingPitcher = winner ? decision?.losingPitcher.name ?? game.pitchers[loser].name : "-";
  return { away: game.fixture.away, home: game.fixture.home, awayScore, homeScore, winningPitcher, losingPitcher, savePitcher };
}

function headKey(team: TeamId, opponent: TeamId) {
  return `${team}:${opponent}`;
}

function updateHeadToHead(state: SeasonState, game: GameState) {
  const away = game.fixture.away;
  const home = game.fixture.home;
  const awayScore = game.score[away];
  const homeScore = game.score[home];
  const awayRecord = state.headToHead[headKey(away, home)] ?? { wins: 0, losses: 0, ties: 0 };
  const homeRecord = state.headToHead[headKey(home, away)] ?? { wins: 0, losses: 0, ties: 0 };
  if (awayScore === homeScore) {
    awayRecord.ties += 1;
    homeRecord.ties += 1;
  } else if (awayScore > homeScore) {
    awayRecord.wins += 1;
    homeRecord.losses += 1;
  } else {
    homeRecord.wins += 1;
    awayRecord.losses += 1;
  }
  state.headToHead[headKey(away, home)] = awayRecord;
  state.headToHead[headKey(home, away)] = homeRecord;
}

function recordCompletedGame(state: SeasonState, game: GameState) {
  recordPitcherWorkload(state, game);
  const summary = makeSummary(game);
  recordGame(state.teamRecords, summary.away, summary.home, summary.awayScore, summary.homeScore);
  updateHeadToHead(state, game);
  recordUserGame(state, game);
  (state.regularResults ??= []).push({ fixtureId: game.fixture.id, summary });
  game.summary = summary;
  addEngineLog(game, `${state.leagueData.teams[summary.away].shortName} ${summary.awayScore}–${summary.homeScore} ${state.leagueData.teams[summary.home].shortName}, 경기 종료.`, true);
  return summary;
}

function archiveRegularSeason(state: SeasonState) {
  if (state.career.seasons.some((summary) => summary.season === state.season)) return;
  state.career.seasons.push({
    season: state.season,
    dataSourceSeason: state.leagueData.sourceSeason,
    datasetLabel: state.leagueData.label,
    teamId: state.config.userTeam,
    playerStats: clone(state.playerStats["USER-PLAYER"]),
    teamRecord: clone(state.teamRecords[state.config.userTeam]),
    goals: {
      position: state.config.position,
      battingOrder: state.config.battingOrder,
      stealSuccess: state.config.stealSuccess,
      targetAvgMin: state.config.targetAvgMin,
      targetAvgMax: state.config.targetAvgMax,
      homeRunCap: state.config.homeRunCap,
      enforceHomeRunCap: state.config.enforceHomeRunCap,
      isFinalSeason: state.config.isFinalSeason,
    },
  });
}

function completeSeason(state: SeasonState) {
  const postseason = state.postseason;
  if (!postseason?.champion) return;
  const archived = state.career.seasons.find((summary) => summary.season === state.season);
  if (archived) {
    archived.postseason = {
      qualified: postseason.seeds.includes(state.config.userTeam),
      champion: postseason.champion,
      playerStats: clone(postseason.playerStats["USER-PLAYER"]),
      seriesStats: clone(postseasonBattingBySeries(state)),
    };
  }
  state.progress = "SEASON_COMPLETE";
  if (state.config.isFinalSeason) {
    state.career.status = "RETIRED";
    state.career.finalSeason = state.season;
  }
}

function finalizePostseasonGame(state: SeasonState) {
  const game = state.game;
  const postseason = state.postseason;
  if (!game || !postseason || game.finalized) return;
  recordPitcherWorkload(state, game);
  const summary = makeSummary(game);
  recordUserGame(state, game);
  game.summary = summary;
  addEngineLog(game, `${state.leagueData.teams[summary.away].shortName} ${summary.awayScore}–${summary.homeScore} ${state.leagueData.teams[summary.home].shortName}, 경기 종료.`, true);
  game.finalized = true;
  state.lastResults = [summary];
  const userPlayed = game.fixture.away === state.config.userTeam || game.fixture.home === state.config.userTeam;
  recordPostseasonResult(postseason, summary, userPlayed ? game.userGameStats : undefined);
  if (isSeriesClinched(postseason.series)) advancePostseasonSeries(postseason);
  if (postseason.champion) completeSeason(state);
  game.phase = "GAME_END_TRANSITION";
}

function finalizeDay(state: SeasonState, rng: SeededRng) {
  const game = state.game;
  if (!game || game.finalized) return;
  const results: GameSummary[] = [recordCompletedGame(state, game)];
  const day = state.schedule[state.currentDay];
  for (const fixture of day.games) {
    if (fixture.away === state.config.userTeam || fixture.home === state.config.userTeam) continue;
    const aiGame = createGame(state, fixture);
    runAutomaticGame(state, aiGame, rng, false);
    results.push(recordCompletedGame(state, aiGame));
  }
  state.lastResults = results;
  game.finalized = true;
  if (state.currentDay >= state.schedule.length - 1) {
    archiveRegularSeason(state);
    state.postseason = createPostseason(state.teamRecords, initialPlayerStats(state.leagueData));
    state.progress = "POSTSEASON";
    game.phase = "GAME_END_TRANSITION";
  } else {
    game.phase = "GAME_END_TRANSITION";
  }
}

function advancePostseasonUntilUserGame(state: SeasonState, rng: SeededRng) {
  const postseason = state.postseason;
  if (!postseason) throw new Error("포스트시즌 상태가 없습니다.");
  let safety = 0;
  while (!postseason.champion && safety < 40) {
    safety += 1;
    const series = postseason.series;
    const fixture = postseasonFixture(series, postseason.games.length);
    const game = createGame(state, fixture, series.stage);
    state.game = game;
    const userGame = seriesIncludes(series, state.config.userTeam);
    runAutomaticGame(state, game, rng, userGame);
    if (game.phase !== "GAME_END_TRANSITION") return;
    finalizePostseasonGame(state);
    if (userGame) return;
    if (state.progress === "SEASON_COMPLETE") {
      game.phase = "SEASON_END";
      return;
    }
  }
  if (safety >= 40) throw new Error("포스트시즌 진행 안전 한도를 초과했습니다.");
}

function startCurrentDay(state: SeasonState, rng: SeededRng) {
  const day = state.schedule[state.currentDay];
  const fixture = day.games.find((candidate) => candidate.away === state.config.userTeam || candidate.home === state.config.userTeam);
  if (!fixture) throw new Error("사용자 팀의 일정을 찾을 수 없습니다.");
  state.game = createGame(state, fixture);
  runAutomaticGame(state, state.game, rng, true);
  if (state.game.phase === "GAME_END_TRANSITION") finalizeDay(state, rng);
}

/** 진단용: 사용자 개입 없이 정규시즌 전체 실행. 저장/원본 JSON은 변경하지 않습니다. */
export function simulateRegularSeason(seed = 1, dataset: LeagueDataset = defaultLeagueDataset) {
  const state = createNewSeason({ seed, debutYear: dataset.sourceSeason ?? defaultSeasonConfig.debutYear }, dataset);
  state.teamRecords = recordForAllTeams(() => blankRecord());
  state.playerStats = initialPlayerStats(state.leagueData);
  state.headToHead = {};
  state.pitcherWorkloads = {};
  state.postseason = undefined;
  state.progress = "REGULAR_SEASON";
  if ("regularResults" in state) (state as SeasonState & { regularResults: unknown[] }).regularResults = [];
  const rng = new SeededRng(seed);
  let starterOuts = 0, pitches = 0, appearances = 0;
  for (const day of state.schedule) for (const fixture of day.games) {
    const game = createGame(state, fixture);
    for (const team of [fixture.away, fixture.home]) {
      const plan = buildSeasonLineupPlan(state.leagueData.teams[team], state.season);
      game.lineups[team] = [...plan[state.teamRecords[team].games % plan.length]];
    }
    state.game = game;
    runAutomaticGame(state, game, rng, false);
    recordCompletedGame(state, game);
    for (const pitcher of Object.values(ensurePitchingHistory(game))) {
      pitches += pitcher.pitchCount;
      appearances += pitcher.battersFaced;
      if (pitcher.isStarter) starterOuts += pitcher.outsRecorded;
    }
  }
  const totals = emptyBatterStats();
  for (const line of Object.values(state.playerStats)) for (const key of Object.keys(totals) as (keyof BatterStats)[]) totals[key] += line[key];
  const games = Object.values(state.teamRecords).reduce((sum, team) => sum + team.games, 0) / 2;
  const runs = Object.values(state.teamRecords).reduce((sum, team) => sum + team.runsFor, 0);
  if (totals.runs !== runs || totals.pa !== appearances || totals.pa !== totals.ab + totals.bb + totals.hbp + totals.sf + totals.sh) {
    throw new Error("진단 실패: 득점·타석·투수 상대 타자 수가 일치하지 않습니다.");
  }
  const profiles = Object.values(state.leagueData.teams).flatMap(team => team.hitters).filter(h => h.statProfile && state.playerStats[h.id].pa > 0);
  const expectedHits = profiles.reduce((sum, h) => sum + h.statProfile!.avg * state.playerStats[h.id].ab, 0);
  const expectedHr = profiles.reduce((sum, h) => sum + h.statProfile!.homeRuns / Math.max(1, h.statProfile!.plateAppearances ?? h.statProfile!.games * 4.1) * state.playerStats[h.id].pa, 0);
  const profiledAB = profiles.reduce((sum, h) => sum + state.playerStats[h.id].ab, 0);
  return {
    seed, games, avg: totals.h / Math.max(1, totals.ab), homeRuns: totals.hr,
    runsPerTeamGame: runs / Math.max(1, games * 2), walksPerPA: totals.bb / Math.max(1, totals.pa),
    strikeoutsPerPA: totals.so / Math.max(1, totals.pa), pitchesPerPA: pitches / Math.max(1, appearances),
    starterInnings: starterOuts / Math.max(1, games * 6), stolenBases: totals.sb, caughtStealing: totals.cs,
    inputWeightedAvg: profiledAB ? expectedHits / profiledAB : null, inputExpectedHomeRuns: profiles.length ? expectedHr : null,
    teams: state.teamRecords,
  };
}

export const defaultSeasonConfig: SeasonConfig = {
  playerName: "",
  position: "2B",
  userTeam: "SAM",
  battingOrder: 2,
  targetAvgMin: 0.301,
  targetAvgMax: 0.309,
  homeRunCap: 42,
  enforceHomeRunCap: true,
  stealSuccess: 0.72,
  seed: 2017,
  debutYear: 2017,
  isFinalSeason: false,
};

function initialPlayerStats(leagueData: LeagueDataset): Record<string, BatterStats> {
  const result: Record<string, BatterStats> = { "USER-PLAYER": emptyBatterStats() };
  Object.values(leagueData.teams).forEach((team) => team.hitters.forEach((hitter) => { result[hitter.id] = emptyBatterStats(); }));
  return result;
}

export function createNewSeason(input: Partial<SeasonConfig> = {}, dataset: LeagueDataset = defaultLeagueDataset): SeasonState {
  const config = { ...defaultSeasonConfig, ...input };
  const leagueData = clone(validateLeagueDataset(dataset));
  const state: SeasonState = {
    schemaVersion: 4,
    season: config.debutYear,
    rngState: config.seed >>> 0,
    config,
    career: { debutYear: config.debutYear, status: "ACTIVE", finalSeason: config.isFinalSeason ? config.debutYear : undefined, seasons: [], milestones: [] },
    leagueData,
    schedule: generateSchedule(supportedTeamIds, config.debutYear, config.seed),
    currentDay: 0,
    teamRecords: recordForAllTeams(() => blankRecord()),
    headToHead: {},
    playerStats: initialPlayerStats(leagueData),
    progress: "REGULAR_SEASON",
    game: null,
    lastResults: [],
  };
  const rng = new SeededRng(state.rngState);
  startCurrentDay(state, rng);
  state.rngState = rng.state;
  return state;
}

export function applyUserChoice(source: SeasonState, choice: UserChoice): SeasonState {
  if (!source.game || source.game.phase !== "USER_AT_BAT") return source;
  if ((choice === "SF" || choice === "SH") && !canChooseSacrifice(source.game, choice)) return source;
  if (choice === "HR" && source.progress === "REGULAR_SEASON" && source.config.enforceHomeRunCap && source.playerStats["USER-PLAYER"].hr >= source.config.homeRunCap) return source;
  if (forcedNoHitRemaining(source) > 0 && choice !== "OUT") return source;
  const state = clone(source);
  syncBattingRestriction(state);
  if (state.battingRestriction && state.battingRestriction.remaining > 0) {
    state.battingRestriction.remaining -= 1;
    if (state.battingRestriction.remaining === 0) state.battingRestriction.cooldownFixtureId = state.game!.fixture.id;
  }
  const game = state.game!;
  const rng = new SeededRng(state.rngState);
  game.focusLogId = game.nextLogId;
  game.phase = "SIMULATING";
  playOne(state, game, rng, choice);
  if (isFinished(game)) {
    if (state.progress === "POSTSEASON") finalizePostseasonGame(state);
    else finalizeDay(state, rng);
  } else if (game.bases[0]?.isUser && !game.bases[1] && game.outs < 3) {
    game.phase = "WAITING_FOR_STEAL";
  } else {
    runAutomaticGame(state, game, rng, true);
    if (isFinished(game)) {
      if (state.progress === "POSTSEASON") finalizePostseasonGame(state);
      else finalizeDay(state, rng);
    }
  }
  state.rngState = rng.state;
  return state;
}

export function resolveUserSteal(source: SeasonState, shouldAttempt: boolean): SeasonState {
  if (!source.game || source.game.phase !== "WAITING_FOR_STEAL") return source;
  const state = clone(source);
  const game = state.game!;
  const rng = new SeededRng(state.rngState);
  game.focusLogId = game.nextLogId;
  if (shouldAttempt && game.bases[0]?.isUser) {
    const runner = game.bases[0];
    const result = attemptSteal(game.bases, rng, state.config.stealSuccess);
    game.bases = result.bases;
    if (result.success) {
      activePlayerStats(state)[runner.playerId].sb += 1;
      game.userGameStats.sb += 1;
      addEngineLog(game, `${runner.name}, 스타트! 2루 도루 성공.`, true);
    } else {
      activePlayerStats(state)[runner.playerId].cs += 1;
      game.userGameStats.cs += 1;
      game.outs += result.outsAdded;
      game.pitchers[fieldingTeam(game)].outsRecorded += result.outsAdded;
      addEngineLog(game, `${runner.name}, 2루에서 태그 아웃. 도루 실패.`, true);
      transitionAfterPlay(game);
    }
  } else {
    addEngineLog(game, `${state.config.playerName}, 도루하지 않습니다.`);
  }
  if (!isFinished(game)) runAutomaticGame(state, game, rng, true);
  if (game.phase === "GAME_END_TRANSITION") {
    if (state.progress === "POSTSEASON") finalizePostseasonGame(state);
    else finalizeDay(state, rng);
  }
  state.rngState = rng.state;
  return state;
}

export function startNextGame(source: SeasonState): SeasonState {
  if (!source.game || source.game.phase !== "GAME_END") return source;
  const state = clone(source);
  const rng = new SeededRng(state.rngState);
  if (state.progress === "POSTSEASON") {
    advancePostseasonUntilUserGame(state, rng);
  } else {
    state.currentDay += 1;
    startCurrentDay(state, rng);
    if (state.game?.phase === "GAME_END_TRANSITION") finalizeDay(state, rng);
  }
  state.rngState = rng.state;
  return state;
}

export function revealGameResult(source: SeasonState): SeasonState {
  if (!source.game || source.game.phase !== "GAME_END_TRANSITION") return source;
  const state = clone(source);
  state.game!.phase = state.progress === "SEASON_COMPLETE" ? "SEASON_END" : "GAME_END";
  return state;
}

export function startNextSeason(source: SeasonState, settings: SeasonGoals, dataset: LeagueDataset = source.leagueData): SeasonState {
  if (!source.game || source.game.phase !== "SEASON_END" || source.career.status === "RETIRED") return source;
  const state = clone(source);
  const nextSeason = state.season + 1;
  const stealSuccess = settings.stealSuccess ?? state.config.stealSuccess;
  if (!Number.isFinite(stealSuccess) || stealSuccess < 0.25 || stealSuccess > 0.95) {
    throw new Error("도루 성공률은 25~95%로 입력해 주세요.");
  }
  const position = settings.position ?? state.config.position;
  if (!userFieldPositions.includes(position)) throw new Error("올바른 포지션을 선택해 주세요.");
  state.config = { ...state.config, ...settings, stealSuccess, position };
  state.battingRestriction = undefined;
  state.userGameHistory = [];
  state.career.finalSeason = settings.isFinalSeason ? nextSeason : undefined;
  state.leagueData = clone(validateLeagueDataset(dataset));
  state.pitcherWorkloads = {};
  state.season = nextSeason;
  state.currentDay = 0;
  state.schedule = generateSchedule(supportedTeamIds, nextSeason, state.config.seed);
  state.teamRecords = recordForAllTeams(() => blankRecord());
  state.headToHead = {};
  state.regularResults = [];
  state.playerStats = initialPlayerStats(state.leagueData);
  state.progress = "REGULAR_SEASON";
  state.postseason = undefined;
  state.game = null;
  state.lastResults = [];
  const rng = new SeededRng(state.rngState);
  startCurrentDay(state, rng);
  state.rngState = rng.state;
  return state;
}

function seedExampleLeagueStats(state: SeasonState) {
  Object.entries(state.playerStats).forEach(([id, stats], index) => {
    if (id === "USER-PLAYER") return;
    const player = getHitter(id, state.config, state.leagueData);
    stats.pa = 164 + (index % 22);
    stats.bb = Math.max(4, Math.round(stats.pa * (0.035 + player.discipline / 1400)));
    stats.hbp = index % 9 === 0 ? 2 : 1;
    stats.sf = index % 5;
    stats.ab = stats.pa - stats.bb - stats.hbp - stats.sf;
    stats.h = Math.min(stats.ab, Math.round(stats.ab * (0.19 + player.contact / 750)));
    stats.hr = Math.min(stats.h, Math.max(0, Math.round((player.power - 35) / 5.2)));
    stats.triples = Math.min(stats.h - stats.hr, player.speed > 80 ? 3 : player.speed > 68 ? 2 : 1);
    stats.doubles = Math.min(stats.h - stats.hr - stats.triples, Math.max(4, Math.round(player.power / 7)));
    stats.rbi = Math.round(stats.h * 0.48 + stats.hr * 1.45);
    stats.runs = Math.round(stats.h * 0.55 + stats.bb * 0.35);
    stats.sb = player.speed > 80 ? Math.round((player.speed - 65) * 0.55) : player.speed > 70 ? 4 : 1;
    stats.cs = Math.round(stats.sb * 0.28);
  });
}

export function createExampleSave(): SeasonState {
  const state = createNewSeason({ ...defaultSeasonConfig, playerName: "이용호" });
  state.currentDay = 45;
  state.teamRecords = {
    KIA: { ...blankRecord(), games: 45, wins: 28, losses: 16, ties: 1, homeGames: 23, awayGames: 22, runsFor: 248, runsAgainst: 198 },
    DOO: { ...blankRecord(), games: 45, wins: 26, losses: 18, ties: 1, homeGames: 22, awayGames: 23, runsFor: 236, runsAgainst: 205 },
    LOT: { ...blankRecord(), games: 45, wins: 23, losses: 21, ties: 1, homeGames: 23, awayGames: 22, runsFor: 218, runsAgainst: 211 },
    NC: { ...blankRecord(), games: 45, wins: 25, losses: 19, ties: 1, homeGames: 22, awayGames: 23, runsFor: 229, runsAgainst: 207 },
    SK: { ...blankRecord(), games: 45, wins: 22, losses: 22, ties: 1, homeGames: 23, awayGames: 22, runsFor: 231, runsAgainst: 226 },
    LG: { ...blankRecord(), games: 45, wins: 21, losses: 23, ties: 1, homeGames: 22, awayGames: 23, runsFor: 194, runsAgainst: 199 },
    NEX: { ...blankRecord(), games: 45, wins: 20, losses: 24, ties: 1, homeGames: 23, awayGames: 22, runsFor: 207, runsAgainst: 215 },
    HAN: { ...blankRecord(), games: 45, wins: 18, losses: 26, ties: 1, homeGames: 22, awayGames: 23, runsFor: 201, runsAgainst: 235 },
    KT: { ...blankRecord(), games: 45, wins: 13, losses: 31, ties: 1, homeGames: 23, awayGames: 22, runsFor: 171, runsAgainst: 251 },
    SAM: { ...blankRecord(), games: 45, wins: 24, losses: 20, ties: 1, homeGames: 22, awayGames: 23, runsFor: 219, runsAgainst: 210 },
  };
  state.headToHead = {
    "SAM:DOO": { wins: 0, losses: 3, ties: 0 },
    "DOO:SAM": { wins: 3, losses: 0, ties: 0 },
  };
  seedExampleLeagueStats(state);
  state.playerStats["USER-PLAYER"] = {
    ...emptyBatterStats(), pa: 195, ab: 170, h: 53, doubles: 15, triples: 3, hr: 14, rbi: 59, runs: 36,
    bb: 22, ibb: 1, hbp: 3, sb: 14, cs: 6,
  };
  const fixture: GameFixture = {
    id: "example-2017-game-46", day: 45, series: 16, gameInSeries: 1, seriesLength: 3, away: "DOO", home: "SAM",
  };
  state.schedule[45] = {
    day: 45,
    games: [
      fixture,
      { id: "example-46-2", day: 45, series: 16, gameInSeries: 1, seriesLength: 3, away: "KIA", home: "LOT" },
      { id: "example-46-3", day: 45, series: 16, gameInSeries: 1, seriesLength: 3, away: "NC", home: "SK" },
      { id: "example-46-4", day: 45, series: 16, gameInSeries: 1, seriesLength: 3, away: "LG", home: "NEX" },
      { id: "example-46-5", day: 45, series: 16, gameInSeries: 1, seriesLength: 3, away: "HAN", home: "KT" },
    ],
  };
  const game = createGame(state, fixture);
  const samsungLineup = game.lineups.SAM;
  game.inning = 3;
  game.half = "BOTTOM";
  game.outs = 2;
  const runner = state.leagueData.teams.SAM.hitters[0];
  game.bases = [{ playerId: runner.id, name: runner.name, teamId: "SAM", speed: runner.speed, isUser: false }, null, null];
  game.bases = [null, game.bases[0], null];
  game.score.SAM = 3;
  game.score.DOO = 1;
  game.lineScore.SAM = [3, 0, 0];
  game.lineScore.DOO = [0, 1, 0];
  game.battingIndex.SAM = samsungLineup.indexOf("USER-PLAYER");
  game.pitchers.DOO = { ...game.pitchers.DOO, pitchCount: 43, runsAllowed: 3, outsRecorded: 8, battersFaced: 11 };
  game.userGameStats = { ...emptyBatterStats(), pa: 1, ab: 1, h: 1, hr: 1, rbi: 3, runs: 1 };
  game.phase = "USER_AT_BAT";
  game.log = [
    { id: 1, inning: 1, half: "BOTTOM", text: "이용호, 니퍼트의 직구를 받아쳐 좌월 3점 홈런!", important: true },
    { id: 2, inning: 2, half: "TOP", text: "양의지, 중전 적시타. 두산이 1점을 만회합니다.", important: true },
    { id: 3, inning: 3, half: "BOTTOM", text: "박해민, 우중간 2루타. 2사 2루.", important: true },
  ];
  game.nextLogId = 4;
  state.game = game;
  state.rngState = 2017046;
  state.lastResults = [];
  return state;
}

export const opponentOf = (fixture: GameFixture, teamId: TeamId) => fixture.away === teamId ? fixture.home : fixture.away;
export const homeAwayLabel = (fixture: GameFixture, teamId: TeamId, dataset: LeagueDataset) => fixture.home === teamId ? `${dataset.teams[teamId].city} 홈` : `${dataset.teams[fixture.home].city} 원정`;
export const getHeadToHead = (state: SeasonState, team: TeamId, opponent: TeamId): HeadToHeadRecord =>
  state.headToHead[headKey(team, opponent)] ?? { wins: 0, losses: 0, ties: 0 };

function normalizeSeasonConfig(config: Partial<SeasonConfig>): SeasonConfig {
  const position = userFieldPositions.find((candidate) => candidate === config.position) ?? defaultSeasonConfig.position;
  return { ...defaultSeasonConfig, ...config, position };
}

function normalizeSeasonGoals(goals: Partial<SeasonGoals> | undefined, config: SeasonConfig, isFinalSeason = false): SeasonGoals {
  return {
    position: goals?.position ?? config.position,
    battingOrder: goals?.battingOrder ?? config.battingOrder,
    stealSuccess: goals?.stealSuccess ?? config.stealSuccess,
    targetAvgMin: goals?.targetAvgMin ?? config.targetAvgMin,
    targetAvgMax: goals?.targetAvgMax ?? config.targetAvgMax,
    homeRunCap: goals?.homeRunCap ?? config.homeRunCap,
    enforceHomeRunCap: goals?.enforceHomeRunCap ?? config.enforceHomeRunCap,
    isFinalSeason: goals?.isFinalSeason ?? isFinalSeason,
  };
}

function migrateSave(value: unknown): SeasonState {
  if (!value || typeof value !== "object") throw new Error("올바른 JSON 세이브가 아닙니다.");
  const candidate = value as Omit<Partial<SeasonState>, "schemaVersion"> & { schemaVersion?: number };
  if (!candidate.config || !candidate.schedule || !candidate.playerStats || typeof candidate.season !== "number") {
    throw new Error("지원하지 않는 세이브 형식입니다.");
  }
  if (candidate.schemaVersion === 4 && candidate.career && candidate.leagueData) {
    validateLeagueDataset(candidate.leagueData);
    const current = clone(candidate) as SeasonState;
    current.config = normalizeSeasonConfig(current.config);
    current.career.seasons = current.career.seasons.map((summary) => ({
      ...summary,
      goals: normalizeSeasonGoals(summary.goals, current.config),
    }));
    return current;
  }
  if (candidate.schemaVersion === 3 && candidate.career && candidate.leagueData) {
    const legacy = clone(candidate) as unknown as SeasonState;
    legacy.schemaVersion = 4;
    legacy.config = normalizeSeasonConfig(legacy.config);
    legacy.career.seasons = legacy.career.seasons.map((summary) => ({ ...summary, goals: normalizeSeasonGoals(summary.goals, legacy.config) }));
    legacy.progress = legacy.game?.phase === "SEASON_END" ? "SEASON_COMPLETE" : "REGULAR_SEASON";
    if (legacy.game) legacy.game.competition = "REGULAR_SEASON";
    legacy.leagueData = clone(validateLeagueDataset(legacy.leagueData));
    return legacy;
  }
  if (candidate.schemaVersion === 2 && candidate.career) {
    const legacy = clone(candidate) as unknown as SeasonState & { career: CareerState & { retirementYear?: number } };
    const isRetired = legacy.career.status === "RETIRED";
    const config = normalizeSeasonConfig({ ...legacy.config, isFinalSeason: isRetired });
    return {
      ...legacy,
      schemaVersion: 4,
      config,
      leagueData: clone(defaultLeagueDataset),
      progress: legacy.game?.phase === "SEASON_END" ? "SEASON_COMPLETE" : "REGULAR_SEASON",
      postseason: undefined,
      game: legacy.game ? { ...legacy.game, competition: "REGULAR_SEASON" } : null,
      career: {
        debutYear: legacy.career.debutYear,
        status: legacy.career.status,
        finalSeason: isRetired ? legacy.season : undefined,
        seasons: legacy.career.seasons.map((summary) => ({
          ...summary,
          goals: normalizeSeasonGoals(summary.goals, config, isRetired && summary.season === legacy.season),
        })),
      },
    } as SeasonState;
  }
  if (candidate.schemaVersion === 1) {
    const legacy = clone(candidate) as unknown as SeasonState;
    const debutYear = Number(candidate.season) || 2017;
    return {
      ...legacy,
      schemaVersion: 4,
      config: normalizeSeasonConfig({ ...legacy.config, debutYear, isFinalSeason: false }),
      leagueData: clone(defaultLeagueDataset),
      career: { debutYear, status: "ACTIVE", seasons: [] },
      progress: legacy.game?.phase === "SEASON_END" ? "SEASON_COMPLETE" : "REGULAR_SEASON",
      postseason: undefined,
      game: legacy.game ? { ...legacy.game, competition: "REGULAR_SEASON" } : null,
    } as SeasonState;
  }
  throw new Error("지원하지 않는 세이브 형식입니다.");
}

export function validateSave(value: unknown): SeasonState {
  const state = migrateSave(value);
  validateCareerMilestones(state);
  const restriction = state.battingRestriction;
  if (restriction && (!Number.isInteger(restriction.remaining) || restriction.remaining < 0 || restriction.remaining > 10 || (restriction.cooldownFixtureId !== undefined && typeof restriction.cooldownFixtureId !== "string"))) {
    throw new Error("강제 NO HIT 저장 기록이 올바르지 않습니다.");
  }
  const normalizeStats = (stats: Partial<BatterStats> | undefined): BatterStats => {
    const normalized = emptyBatterStats();
    for (const key of Object.keys(normalized) as Array<keyof BatterStats>) {
      const count = stats?.[key];
      if (count === undefined) continue;
      if (!Number.isInteger(count) || count < 0) throw new Error(`세이브의 ${key} 기록이 올바르지 않습니다.`);
      normalized[key] = count;
    }
    return normalized;
  };
  const normalizeMap = (stats: Record<string, BatterStats>) => {
    for (const id of Object.keys(stats)) stats[id] = normalizeStats(stats[id]);
  };
  normalizeMap(state.playerStats);
  if (state.userGameHistory !== undefined) {
    if (!Array.isArray(state.userGameHistory)) throw new Error("개인 경기 기록이 올바르지 않습니다.");
    for (const record of state.userGameHistory) {
      if (!record || typeof record.fixtureId !== "string" || typeof record.competition !== "string") throw new Error("개인 경기 기록이 올바르지 않습니다.");
      record.stats = normalizeStats(record.stats);
    }
  }
  restoreTeamStreaks(state);
  if (state.game) {
    state.game.userGameStats = normalizeStats(state.game.userGameStats);
    ensurePitchingHistory(state.game);
    for (const teamId of supportedTeamIds) usedPitchersFor(state, state.game, teamId);
  }
  if (state.postseason) {
    normalizeMap(state.postseason.playerStats);
    for (const record of state.postseason.games) {
      if (record.userStats) record.userStats = normalizeStats(record.userStats);
    }
  }
  for (const season of state.career.seasons) {
    season.playerStats = normalizeStats(season.playerStats);
    if (!season.postseason) continue;
    season.postseason.playerStats = normalizeStats(season.postseason.playerStats);
    for (const series of season.postseason.seriesStats ?? []) series.playerStats = normalizeStats(series.playerStats);
  }
  return state;
}

export function userFixtures(schedule: DaySchedule[], teamId: TeamId) {
  return schedule.map((day) => day.games.find((game) => game.home === teamId || game.away === teamId)!);
}
