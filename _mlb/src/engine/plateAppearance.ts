import { ensurePitchingHistory } from "./pitching";
import { simulationConfig } from "../data/simulationConfig";
import { advanceOnForcedWalk, advanceOnHomeRun } from "./baserunning";
import { SeededRng } from "./rng";
import type {
  BatterStats,
  Baserunner,
  GameState,
  HitterProfile,
  PitcherProfile,
  TeamId,
  UserChoice,
} from "./types";

export interface PlateAppearanceContext {
  game: GameState;
  batter: HitterProfile;
  pitcher: PitcherProfile;
  battingTeam: TeamId;
  stats: Record<string, BatterStats>;
  rng: SeededRng;
  userChoice?: UserChoice;
}

export interface PlateAppearanceResult {
  outcome: UserChoice | "SO" | "GO" | "FO" | "LO" | "GIDP" | "SF" | "FC" | "ROE";
  batterReached: boolean;
}

const addLog = (game: GameState, text: string, important = false) => {
  game.log.push({ id: game.nextLogId++, inning: game.inning, half: game.half, text, important });
  if (game.log.length > simulationConfig.logLimit) game.log.splice(0, game.log.length - simulationConfig.logLimit);
};

const isUser = (id: string) => id === "USER-PLAYER";

const addRun = (context: PlateAppearanceContext, runner: Baserunner) => {
  const { game, battingTeam, stats } = context;
  game.score[battingTeam] += 1;
  const inningIndex = game.inning - 1;
  game.lineScore[battingTeam][inningIndex] = (game.lineScore[battingTeam][inningIndex] ?? 0) + 1;
  stats[runner.playerId].runs += 1;
  if (runner.isUser) game.userGameStats.runs += 1;
  const fieldingTeam = battingTeam === game.fixture.away ? game.fixture.home : game.fixture.away;
  const current = game.pitchers[fieldingTeam];
  const responsibleId = runner.responsiblePitcherId ?? current.pitcherId;
  const history = ensurePitchingHistory(game);
  (history[responsibleId] ?? current).runsAllowed += 1;
  if (game.score[battingTeam] >= game.score[fieldingTeam]) current.leadLost = true;
  if (game.score[battingTeam] === game.score[fieldingTeam] + 1) game.goAheadPitcherId = responsibleId;
};

const creditRuns = (context: PlateAppearanceContext, runners: Baserunner[], creditRbi = true, homeRun = false) => {
  let count = 0;
  for (const runner of runners) {
    const g = context.game;
    if (!homeRun && g.inning >= 9 && g.half === "BOTTOM" && g.score[g.fixture.home] > g.score[g.fixture.away]) break;
    addRun(context, runner);
    count++;
  }
  if (creditRbi && count) {
    context.stats[context.batter.id].rbi += count;
    if (isUser(context.batter.id)) context.game.userGameStats.rbi += count;
  }
  return count;
};

const runnerFrom = (batter: HitterProfile, teamId: TeamId, game: GameState): Baserunner => ({
  playerId: batter.id,
  name: batter.name,
  teamId,
  speed: batter.speed,
  isUser: isUser(batter.id),
  responsiblePitcherId: game.pitchers[teamId === game.fixture.away ? game.fixture.home : game.fixture.away].pitcherId,
});

const addCommonPa = (context: PlateAppearanceContext) => {
  context.stats[context.batter.id].pa += 1;
  if (isUser(context.batter.id)) context.game.userGameStats.pa += 1;
  const pitcher = context.game.pitchers[context.battingTeam === context.game.fixture.away ? context.game.fixture.home : context.game.fixture.away];
  pitcher.battersFaced += 1;
};

const addAtBat = (context: PlateAppearanceContext) => {
  context.stats[context.batter.id].ab += 1;
  if (isUser(context.batter.id)) context.game.userGameStats.ab += 1;
};

const addHit = (context: PlateAppearanceContext, type: "1B" | "2B" | "3B" | "HR") => {
  const stats = context.stats[context.batter.id];
  stats.h += 1;
  if (type === "2B") stats.doubles += 1;
  if (type === "3B") stats.triples += 1;
  if (type === "HR") stats.hr += 1;
  if (isUser(context.batter.id)) {
    const today = context.game.userGameStats;
    today.h += 1;
    if (type === "2B") today.doubles += 1;
    if (type === "3B") today.triples += 1;
    if (type === "HR") today.hr += 1;
  }
};

export function canChooseSacrifice(game: GameState, choice: "SF" | "SH") {
  if (game.outs >= 2) return false;
  if (choice === "SF") return Boolean(game.bases[2]);
  // 일반 진루 번트만 지원합니다. 3루 주자가 있는 스퀴즈는 별도 전술입니다.
  return !game.bases[2] && Boolean(game.bases[0] || game.bases[1]);
}

function resolveSacrifice(context: PlateAppearanceContext, choice: "SF" | "SH"): PlateAppearanceResult {
  const { game, batter, stats } = context;
  const key = choice === "SF" ? "sf" : "sh";
  stats[batter.id][key] += 1;
  if (isUser(batter.id)) game.userGameStats[key] += 1;
  game.outs += 1;
  if (choice === "SF") {
    const runner = game.bases[2]!;
    game.bases[2] = null;
    creditRuns(context, [runner]);
    addLog(game, `${batter.name}, 중견수 희생플라이. ${runner.name} 득점.`, true);
  } else {
    const first = game.bases[0];
    const second = game.bases[1];
    game.bases = [null, first, second];
    const advances = [first ? `${first.name} 2루 진루` : "", second ? `${second.name} 3루 진루` : ""].filter(Boolean);
    addLog(game, `${batter.name}, 희생번트로 아웃. ${advances.join(" · ")}.`);
  }
  return { outcome: choice, batterReached: false };
}

function shouldAutoBunt(context: PlateAppearanceContext) {
  const { game, batter, rng } = context;
  return canChooseSacrifice(game, "SH") && game.outs === 0 && game.inning >= 6
    && Math.abs(game.score[game.fixture.away] - game.score[game.fixture.home]) <= 1
    && batter.power < 65 && rng.chance(simulationConfig.automaticSacrificeBuntRate);
}

function chooseAutoOutcome(batter: HitterProfile, pitcher: PitcherProfile, rng: SeededRng): UserChoice {
  if (batter.statProfile) {
    const profile = batter.statProfile;
    const games = Math.max(1, profile.games);
    const plateAppearances = Math.max(1, profile.plateAppearances ?? Math.round(games * 4.1));
    const walk = profile.walks !== undefined
      ? profile.walks / plateAppearances
      : profile.onBasePct !== undefined
        ? Math.max(0.025, (profile.onBasePct - profile.avg) / Math.max(0.2, 1 - profile.avg))
        : profile.eye !== undefined
          ? 0.048 + profile.eye * 0.008
          : 0.075;
    const hbp = 0.009;
    const atBats = profile.atBats ?? plateAppearances * (1 - walk - hbp - 0.006);
    const hitRate = profile.avg * atBats / plateAppearances;
    let hr = profile.homeRuns / plateAppearances;
    let triple = profile.triples !== undefined ? profile.triples / plateAppearances : Math.max(0.002, 0.004 + (batter.speed - 50) / 10000);
    let double = profile.doubles !== undefined ? profile.doubles / plateAppearances : Math.min(0.065, 0.042 + profile.homeRuns / Math.max(1, games) * 0.025);
    let single = Math.max(0.015, hitRate - hr - triple - double);
    const contactResistance = pitcher.stuff * 0.7 + pitcher.movement * 0.3;
    const powerResistance = pitcher.stuff * 0.45 + pitcher.movement * 0.55;
    const contactAdjustment = (72 - contactResistance) / 1100;
    const powerAdjustment = (72 - powerResistance) / 2600;
    single = Math.max(0.03, single + contactAdjustment);
    double = Math.max(0.012, double + powerAdjustment * 0.35);
    triple = Math.max(0.001, triple + powerAdjustment * 0.08);
    hr = Math.max(0.003, hr + powerAdjustment * 0.57);
    const adjustedWalk = Math.max(0.025, walk + (72 - pitcher.control) / 1000);
    const roll = rng.next();
    let threshold = adjustedWalk;
    if (roll < threshold) return "BB";
    threshold += hbp;
    if (roll < threshold) return "HBP";
    threshold += hr;
    if (roll < threshold) return "HR";
    threshold += triple;
    if (roll < threshold) return "3B";
    threshold += double;
    if (roll < threshold) return "2B";
    threshold += single;
    return roll < threshold ? "1B" : "OUT";
  }
  const contactResistance = pitcher.stuff * 0.7 + pitcher.movement * 0.3;
  const powerResistance = pitcher.stuff * 0.45 + pitcher.movement * 0.55;
  const contactEdge = (batter.contact - contactResistance) / 850;
  const powerEdge = (batter.power - powerResistance) / 1800;
  const walk = Math.max(0.035, 0.075 + (batter.discipline - pitcher.control) / 1000);
  const hbp = 0.009;
  const hr = Math.max(0.008, 0.027 + powerEdge);
  const triple = Math.max(0.002, 0.004 + (batter.speed - 50) / 10000);
  const double = Math.max(0.025, 0.047 + (batter.power - 55) / 3000);
  const single = Math.max(0.105, 0.155 + contactEdge);
  const roll = rng.next();
  let threshold = walk;
  if (roll < threshold) return "BB";
  threshold += hbp;
  if (roll < threshold) return "HBP";
  threshold += hr;
  if (roll < threshold) return "HR";
  threshold += triple;
  if (roll < threshold) return "3B";
  threshold += double;
  if (roll < threshold) return "2B";
  threshold += single;
  return roll < threshold ? "1B" : "OUT";
}

function resolveOut(context: PlateAppearanceContext): PlateAppearanceResult {
  const { game, batter, stats, rng } = context;
  const batterStats = stats[batter.id];
  const roll = rng.next();
  const profileStrikeoutRate = batter.statProfile?.strikeouts !== undefined
    ? batter.statProfile.strikeouts / Math.max(1, batter.statProfile.plateAppearances ?? batter.statProfile.games * 4.1)
    : undefined;
  const strikeoutCut = profileStrikeoutRate === undefined
    ? Math.max(0.14, 0.25 + (context.pitcher.stuff - batter.contact) / 500)
    : Math.max(0.06, Math.min(0.58, profileStrikeoutRate / 0.67 + (context.pitcher.stuff - 72) / 700));
  const errorCut = strikeoutCut + simulationConfig.errorRateOnOutChoice;
  const groundCut = errorCut + Math.max(0.31, Math.min(0.43, 0.36 + (context.pitcher.movement - 50) / 900));
  const flyCut = groundCut + 0.25;

  if (roll < strikeoutCut) {
    addAtBat(context);
    batterStats.so += 1;
    if (isUser(batter.id)) game.userGameStats.so += 1;
    game.outs += 1;
    addLog(game, `${batter.name}, 헛스윙 삼진.`);
    return { outcome: "SO", batterReached: false };
  }

  if (roll < errorCut) {
    // 일반적인 실책 출루는 공식 타수에 포함됩니다(안타는 아님).
    addAtBat(context);
    batterStats.roe += 1;
    if (isUser(batter.id)) game.userGameStats.roe += 1;
    const advance = advanceOnForcedWalk(game.bases, runnerFrom(batter, context.battingTeam, game));
    game.bases = advance.bases;
    creditRuns(context, advance.scored, false);
    addLog(game, `${batter.name}, 내야 실책으로 출루.`, true);
    return { outcome: "ROE", batterReached: true };
  }

  if (roll < groundCut) {
    addAtBat(context);
    if (game.bases[0] && game.outs < 2 && rng.chance(simulationConfig.doublePlayRate)) {
      const retired = game.bases[0];
      game.bases[0] = null;
      game.outs += 2;
      batterStats.gidp += 1;
      if (isUser(batter.id)) game.userGameStats.gidp += 1;
      let scored = 0;
      if (game.outs < 3) {
        const second = game.bases[1], third = game.bases[2];
        game.bases[1] = null;
        game.bases[2] = second;
        if (third) scored = creditRuns(context, [third], false);
      }
      addLog(game, `${batter.name}, 유격수-2루수-1루수 병살타. ${retired.name}도 아웃.${scored ? " 3루 주자 득점(타점 없음)." : ""}`, scored > 0);
      return { outcome: "GIDP", batterReached: false };
    }
    if (game.bases[0] && game.outs < 2 && rng.chance(0.1)) {
      const responsiblePitcherId = game.bases[0].responsiblePitcherId;
      game.bases[0] = runnerFrom(batter, context.battingTeam, game);
      // 승계주자를 야수선택으로 바꾼 대체 주자도 원래 투수의 책임을 이어갑니다.
      game.bases[0].responsiblePitcherId = responsiblePitcherId ?? game.bases[0].responsiblePitcherId;
      game.outs += 1;
      addLog(game, `${batter.name}, 야수선택으로 1루 출루.`);
      return { outcome: "FC", batterReached: true };
    }
    game.outs += 1;
    if (game.bases[2] && game.outs < 3 && rng.chance(0.28)) {
      const runner = game.bases[2];
      game.bases[2] = null;
      creditRuns(context, [runner]);
      addLog(game, `${batter.name}, 2루수 땅볼. ${runner.name} 득점.`, true);
    } else {
      addLog(game, `${batter.name}, 유격수 땅볼 아웃.`);
    }
    return { outcome: "GO", batterReached: false };
  }

  if (roll < flyCut) {
    if (game.bases[2] && game.outs < 2 && rng.chance(simulationConfig.sacrificeFlyRate)) {
      return resolveSacrifice(context, "SF");
    }
    addAtBat(context);
    game.outs += 1;
    addLog(game, `${batter.name}, ${rng.pick(["좌익수", "중견수", "우익수"])} 뜬공 아웃.`);
    return { outcome: "FO", batterReached: false };
  }

  addAtBat(context);
  game.outs += 1;
  addLog(game, `${batter.name}, 3루수 직선타 아웃.`);
  return { outcome: "LO", batterReached: false };
}

function resolvePlateAppearancePlay(context: PlateAppearanceContext): PlateAppearanceResult {
  if ((context.userChoice === "SF" || context.userChoice === "SH") && !canChooseSacrifice(context.game, context.userChoice)) {
    throw new Error("현재 주자·아웃 상황에서는 해당 희생타를 선택할 수 없습니다.");
  }
  addCommonPa(context);
  const { game, batter, stats, rng } = context;
  const choice = context.userChoice ?? (shouldAutoBunt(context) ? "SH" : chooseAutoOutcome(batter, context.pitcher, rng));
  const runner = runnerFrom(batter, context.battingTeam, game);
  const originalBases = [...game.bases];

  if (choice === "OUT") return resolveOut(context);
  if (choice === "SF" || choice === "SH") return resolveSacrifice(context, choice);

  if (choice === "BB" || choice === "IBB" || choice === "HBP") {
    const batterStats = stats[batter.id];
    if (choice === "HBP") batterStats.hbp += 1;
    else batterStats.bb += 1;
    if (choice === "IBB") batterStats.ibb += 1;
    if (isUser(batter.id)) {
      if (choice === "HBP") game.userGameStats.hbp += 1;
      else game.userGameStats.bb += 1;
      if (choice === "IBB") game.userGameStats.ibb += 1;
    }
    const advance = advanceOnForcedWalk(game.bases, runner);
    game.bases = advance.bases;
    creditRuns(context, advance.scored);
    const label = choice === "BB" ? "볼넷" : choice === "IBB" ? "고의사구" : "몸에 맞는 공";
    addLog(game, `${batter.name}, ${label}.${advance.scored.length ? " 밀어내기 득점." : ""}`, advance.scored.length > 0);
    return { outcome: choice, batterReached: true };
  }

  addAtBat(context);
  if (choice === "HR") {
    addHit(context, "HR");
    const advance = advanceOnHomeRun(game.bases, runner);
    game.bases = advance.bases;
    creditRuns(context, advance.scored, true, true);
    addLog(game, `${batter.name}, ${advance.scored.length}점 홈런!`, true);
    return { outcome: choice, batterReached: false };
  }

  const scored: Baserunner[] = [];
  const winningRunsNeeded = game.inning >= 9 && game.half === "BOTTOM"
    ? game.score[game.fixture.away] - game.score[game.fixture.home] + 1 : Infinity;
  if (choice === "3B") {
    [...game.bases].reverse().forEach((baseRunner) => { if (baseRunner) scored.push(baseRunner); });
    game.bases = [null, null, runner];
  } else if (choice === "2B") {
    if (game.bases[2]) scored.push(game.bases[2]);
    if (game.bases[1]) scored.push(game.bases[1]);
    const first = game.bases[0];
    if (first && scored.length < winningRunsNeeded && rng.chance(0.58 + (first.speed - 50) / 250)) scored.push(first);
    game.bases = [null, runner, first && !scored.includes(first) ? first : null];
  } else {
    if (game.bases[2]) scored.push(game.bases[2]);
    const second = game.bases[1];
    const first = game.bases[0];
    let third: Baserunner | null = null;
    let secondBase: Baserunner | null = null;
    if (second && scored.length < winningRunsNeeded) {
      const scoreChance = 0.69 + (second.speed - 50) / 220 + (game.outs === 2 ? 0.1 : 0);
      if (rng.chance(scoreChance)) scored.push(second);
      else if (rng.chance(0.08)) {
        game.outs += 1;
        addLog(game, `${second.name}, 외야 송구에 홈에서 아웃.`, true);
      } else third = second;
    }
    if (first && scored.length < winningRunsNeeded) {
      if (!third && rng.chance(0.37 + (first.speed - 50) / 250)) third = first;
      else secondBase = first;
    }
    game.bases = [runner, secondBase, third];
  }
  const credited = creditRuns(context, scored);
  let hit: "1B" | "2B" | "3B" = choice;
  if (game.inning >= 9 && game.half === "BOTTOM" && game.score[game.fixture.home] > game.score[game.fixture.away] && credited) {
    const winningRunner = scored[credited - 1];
    const distance = 3 - originalBases.indexOf(winningRunner);
    const bases = Math.min(choice === "3B" ? 3 : choice === "2B" ? 2 : 1, distance);
    hit = bases === 3 ? "3B" : bases === 2 ? "2B" : "1B";
  }
  addHit(context, hit);
  const label = hit === "1B" ? rng.pick(["좌전 안타", "중전 안타", "우전 안타"]) : hit === "2B" ? "2루타" : "3루타";
  addLog(game, `${batter.name}, ${label}.${credited ? ` ${credited}명 득점.` : ""}`, credited > 0 || hit !== "1B");
  return { outcome: hit, batterReached: true };
}

export function resolvePlateAppearance(context: PlateAppearanceContext): PlateAppearanceResult {
  if ((context.userChoice === "SF" || context.userChoice === "SH") && !canChooseSacrifice(context.game, context.userChoice)) {
    throw new Error("현재 주자·아웃 상황에서는 해당 희생타를 선택할 수 없습니다.");
  }
  ensurePitchingHistory(context.game);
  const defense = context.battingTeam === context.game.fixture.away ? context.game.fixture.home : context.game.fixture.away;
  const pitcher = context.game.pitchers[defense];
  for (const runner of context.game.bases) if (runner) runner.responsiblePitcherId ??= pitcher.pitcherId;
  const result = resolvePlateAppearancePlay(context);
  // 타석 결과별 투구 수. 자동 고의사구는 투구 없이 처리합니다.
  pitcher.pitchCount += result.outcome === "IBB" ? 0 : result.outcome === "BB" ? context.rng.int(4, 7)
    : result.outcome === "SO" ? context.rng.int(3, 7) : context.rng.int(1, 5);
  return result;
}
