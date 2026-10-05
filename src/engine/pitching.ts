import type { GameFixture, GameState, PitcherProfile, SeasonState } from "./types";

// 현재 투수는 살아 있는 객체로 연결합니다. JSON 재로딩 후에도 참조를 다시 연결합니다.
export function ensurePitchingHistory(game: GameState) {
  game.pitchingHistory ??= {};
  const defense = game.half === "TOP" ? game.fixture.home : game.fixture.away;
  for (const runner of game.bases) if (runner) runner.responsiblePitcherId ??= game.pitchers[defense].pitcherId;
  for (const team of [game.fixture.away, game.fixture.home]) {
    const pitcher = game.pitchers[team];
    game.pitchingHistory[pitcher.pitcherId] = pitcher;
  }
  return game.pitchingHistory;
}

export function workloadDay(state: SeasonState, fixture: GameFixture) {
  const date = "date" in fixture ? fixture.date : undefined;
  if (typeof date === "string") return Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  const last = state.schedule.at(-1)?.games[0];
  const lastDate = last && "date" in last ? last.date : undefined;
  return typeof lastDate === "string"
    ? Math.floor(Date.parse(lastDate + "T00:00:00Z") / 86400000) + 1 + Math.max(0, fixture.day - 200)
    : fixture.day;
}

export function remainingWorkload(state: SeasonState, game: GameState, id: string) {
  const previous = state.pitcherWorkloads?.[id];
  if (!previous) return 0;
  const days = Math.max(0, workloadDay(state, game.fixture) - previous.day);
  return Math.max(0, previous.load - days * 14);
}

export function effectivePitcher(state: SeasonState, game: GameState, pitcher: PitcherProfile) {
  const defense = game.half === "TOP" ? game.fixture.home : game.fixture.away;
  const current = game.pitchers[defense];
  const onset = current.isStarter ? 65 + (pitcher.stamina - 70) * .7 : 16 + (pitcher.stamina - 45) * .6;
  const penalty = Math.min(25, Math.max(0, current.pitchCount - onset) / 4 + remainingWorkload(state, game, pitcher.id) * .3);
  return { ...pitcher, stuff: Math.max(1, pitcher.stuff - penalty), movement: Math.max(1, pitcher.movement - penalty * .7), control: Math.max(1, pitcher.control - penalty) };
}

export function recordPitcherWorkload(state: SeasonState, game: GameState) {
  if (game.workloadRecorded) return;
  const history = ensurePitchingHistory(game);
  state.pitcherWorkloads ??= {};
  for (const pitcher of Object.values(history)) {
    if (!pitcher.battersFaced && !pitcher.outsRecorded) continue;
    state.pitcherWorkloads[pitcher.pitcherId] = {
      day: workloadDay(state, game.fixture),
      load: Math.min(100, remainingWorkload(state, game, pitcher.pitcherId) + pitcher.pitchCount * .8),
    };
  }
  game.workloadRecorded = true;
}

export function pitchingAwards(game: GameState, winner: typeof game.fixture.home) {
  const history = ensurePitchingHistory(game);
  const decision = game.pitchingDecision?.leadingTeam === winner ? game.pitchingDecision : undefined;
  const final = game.pitchers[winner];
  let winning = decision?.winningPitcher ?? final;
  const candidate = history[winning.pitcherId];
  if (candidate?.isStarter && candidate.outsRecorded < 15) {
    // 5이닝 미달 시 공식 기록원의 '효과적 구원' 판단을 실점·투구 아웃 수로 근사합니다.
    const own = new Set(final.usedPitcherIds ?? [final.pitcherId]);
    const relievers = Object.values(history).filter(p => own.has(p.pitcherId) && !p.isStarter && p.outsRecorded > 0)
      .sort((a, b) => (a.runsAllowed / a.outsRecorded - b.runsAllowed / b.outsRecorded) || b.outsRecorded - a.outsRecorded);
    if (relievers[0]) winning = relievers[0];
  }
  const save = !final.isStarter && final.pitcherId !== winning.pitcherId && !final.leadLost
    && (final.entryLead ?? 0) > 0 && final.outsRecorded >= 1
    && (final.entryTyingRun === true || ((final.entryLead ?? 99) <= 3 && final.outsRecorded >= 3) || final.outsRecorded >= 9);
  return { winningPitcher: winning.name, savePitcher: save ? final.name : undefined };
}
