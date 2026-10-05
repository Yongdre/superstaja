import { describe, expect, it, vi } from "vitest";
import { supportedTeamIds, leagueDataTemplate } from "../../data/leagueDataset";
import { checkPitchingChange, createGame, createNewSeason, makeSummary, maybeAutoSteal, updatePitchingDecision, validateSave } from "../gameEngine";
import { effectivePitcher, ensurePitchingHistory, pitchingAwards, recordPitcherWorkload, remainingWorkload, workloadDay } from "../pitching";
import { resolvePlateAppearance } from "../plateAppearance";
import { emptyBatterStats } from "../statistics";
import { SeededRng } from "../rng";
import type { Baserunner, UserChoice } from "../types";

const home = supportedTeamIds[0], away = supportedTeamIds[1];
function setup() {
  const state = createNewSeason({ userTeam: home, playerName: "검증" }, leagueDataTemplate);
  const game = createGame(state, { ...state.game!.fixture, away, home });
  state.game = game;
  state.playerStats = Object.fromEntries(Object.values(state.leagueData.teams).flatMap(t => t.hitters.map(p => [p.id, emptyBatterStats()])));
  state.playerStats["USER-PLAYER"] = emptyBatterStats();
  const hitters = state.leagueData.teams[home].hitters;
  const runner = (i: number): Baserunner => ({ playerId: hitters[i].id, name: hitters[i].name, speed: hitters[i].speed, teamId: home, isUser: false });
  game.half = "BOTTOM";
  const play = (choice: UserChoice, rng = new SeededRng(1)) => resolvePlateAppearance({
    game, batter: hitters[0], pitcher: state.leagueData.teams[away].pitchers[0],
    battingTeam: home, stats: state.playerStats, rng, userChoice: choice,
  });
  return { state, game, hitters, runner, play };
}

describe("시뮬레이션 회귀: 끝내기와 주자", () => {
  it.each(["1B","2B","3B"] as const)("%s 끝내기는 승리 득점에서 멈추고 실제 루타를 기록한다", choice => {
    const { game, runner, play, state, hitters } = setup();
    game.inning = 9; game.bases = [null, runner(1), runner(2)];
    play(choice);
    expect(game.score[home]).toBe(1);
    expect(state.playerStats[hitters[0].id]).toMatchObject({ h: 1, rbi: 1, doubles: 0, triples: 0 });
    expect(state.playerStats[hitters[1].id].runs).toBe(0);
    expect(state.playerStats[hitters[2].id].runs).toBe(1);
  });
  it("끝내기 홈런은 모든 주자와 타자가 득점한다", () => {
    const {game, runner, play, state, hitters} = setup();
    game.inning = 9; game.bases = [runner(1), runner(2), runner(3)];
    play("HR");
    expect(game.score[home]).toBe(4);
    expect(state.playerStats[hitters[0].id]).toMatchObject({ hr: 1, rbi: 4 });
  });
  it("끝내기 득점 뒤 후속 주자의 홈 아웃은 추가 판정하지 않는다", () => {
    const {game,runner,play} = setup();
    game.inning = 9; game.outs = 2; game.bases = [null,runner(1),runner(2)];
    const rng = new SeededRng(1), chance = vi.spyOn(rng,"chance").mockReturnValueOnce(false).mockReturnValueOnce(true);
    play("1B",rng);
    expect(game.score[home]).toBe(1);
    expect(game.outs).toBe(2);
    expect(chance).not.toHaveBeenCalled();
  });
  it("1점 뒤진 2·3루의 끝내기 3루타는 2루타·2타점이다", () => {
    const {game, runner, play, state, hitters} = setup();
    game.inning = 9; game.score[away] = 1; game.bases = [null, runner(1), runner(2)];
    play("3B");
    expect(game.score[home]).toBe(2);
    expect(state.playerStats[hitters[0].id]).toMatchObject({ doubles: 1, triples: 0, rbi: 2 });
  });
  it.each([0,1])("%i사 병살의 득점·진루와 무타점을 처리한다", outs => {
    const {game, runner, play, state, hitters} = setup();
    game.outs = outs; game.bases = [runner(1), runner(2), runner(3)];
    const rng = new SeededRng(1);
    vi.spyOn(rng, "next").mockReturnValue(.5);
    vi.spyOn(rng, "chance").mockReturnValue(true);
    expect(play("OUT", rng).outcome).toBe("GIDP");
    expect(game.outs).toBe(outs + 2);
    expect(game.score[home]).toBe(outs ? 0 : 1);
    expect(state.playerStats[hitters[0].id].rbi).toBe(0);
    if (!outs) expect(game.bases.map(p => p?.playerId ?? null)).toEqual([null, null, hitters[2].id]);
  });
  it("불가능한 희생타는 메타데이터까지 변경하지 않는다", () => {
    const {state, game, play} = setup();
    game.outs = 2;
    const before = structuredClone(state);
    expect(() => play("SF")).toThrow();
    expect(state).toEqual(before);
  });
});

describe("시뮬레이션 회귀: 투수 운용과 피로", () => {
  it.each(["TOP","BOTTOM"] as const)("%s 4이닝 150구는 동일하게 교체된다", half => {
    const {state, game} = setup();
    game.half = half; game.inning = 5;
    const team = half === "TOP" ? home : away;
    const old = game.pitchers[team];
    old.outsRecorded = 12; old.pitchCount = 150;
    checkPitchingChange(state, game, new SeededRng(1));
    expect(game.pitchers[team].pitcherId).not.toBe(old.pitcherId);
  });
  it.each(["TOP","BOTTOM"] as const)("%s 4이닝 70구는 회차 착오로 교체되지 않는다", half => {
    const {state, game} = setup();
    game.half = half; game.inning = 5;
    const team = half === "TOP" ? home : away, old = game.pitchers[team];
    old.outsRecorded = 12; old.pitchCount = 70;
    checkPitchingChange(state, game, new SeededRng(1));
    expect(game.pitchers[team].pitcherId).toBe(old.pitcherId);
  });
  it("2회 10실점·100구이면 최소 이닝에 관계없이 강판한다", () => {
    const {state, game} = setup();
    game.inning = 2; const old = game.pitchers[away];
    old.runsAllowed = 10; old.pitchCount = 100;
    checkPitchingChange(state, game, new SeededRng(1));
    expect(game.pitchers[away].pitcherId).not.toBe(old.pitcherId);
  });
  it("9회 리드 상황은 선발 투구 한도 전이라도 마무리를 투입한다", () => {
    const {state, game} = setup();
    game.inning = 9; game.score[away] = 2;
    checkPitchingChange(state, game, new SeededRng(1));
    const closer = state.leagueData.teams[away].pitchers.find(p => p.role === "CP")!;
    expect(game.pitchers[away]).toMatchObject({pitcherId: closer.id, entryLead: 2, entryTyingRun: true});
  });
  it("접전에는 강한 RP를, 그 투수가 연투로 지치면 다른 RP를 선택한다", () => {
    for (const exhausted of [false,true]) {
      const {state, game} = setup();
      game.inning = 8; game.pitchers[away].pitchCount = 150;
      const relievers = state.leagueData.teams[away].pitchers.filter(p => p.role === "RP");
      relievers.forEach((p,i) => Object.assign(p, {stuff:i ? 70 : 95, movement:i ? 70 : 95, control:i ? 70 : 95}));
      if (exhausted) state.pitcherWorkloads = {[relievers[0].id]: {day: workloadDay(state, game.fixture), load: 60}};
      checkPitchingChange(state, game, new SeededRng(1));
      expect(game.pitchers[away].pitcherId === relievers[0].id).toBe(!exhausted);
    }
  });
  it("투구 수·전 경기 피로가 능력을 낮추며 원본 JSON은 바뀌지 않는다", () => {
    const {state,game} = setup(), profile = state.leagueData.teams[away].pitchers[0], original = {...profile};
    game.pitchers[away].pitchCount = 130;
    state.pitcherWorkloads = {[profile.id]: {day: workloadDay(state, game.fixture)-1, load:40}};
    expect(effectivePitcher(state,game,profile).stuff).toBeLessThan(profile.stuff);
    expect(profile).toEqual(original);
    state.pitcherWorkloads[profile.id].day -= 10;
    expect(remainingWorkload(state,game,profile.id)).toBe(0);
  });
  it("경기 완료 피로 기록은 중복 적용하지 않고 세이브로 보존한다", () => {
    const {state,game} = setup();
    game.pitchers[away].pitchCount = 100; game.pitchers[away].battersFaced = 25;
    recordPitcherWorkload(state,game);
    const before = structuredClone(state.pitcherWorkloads);
    recordPitcherWorkload(state,game);
    expect(state.pitcherWorkloads).toEqual(before);
    expect(validateSave(JSON.parse(JSON.stringify(state))).pitcherWorkloads).toEqual(before);
  });
});

describe("시뮬레이션 회귀: 책임투수와 승패·세이브", () => {
  it("야수선택으로 승계주자가 바뀌어도 원래 책임투수에게 실점을 준다", () => {
    const {state,game,runner,play} = setup();
    const starter = game.pitchers[away];
    starter.pitchCount = 150;
    game.bases = [runner(1),null,null];
    checkPitchingChange(state,game,new SeededRng(1));
    const reliever = game.pitchers[away], rng = new SeededRng(1);
    vi.spyOn(rng,"next").mockReturnValue(.5);
    vi.spyOn(rng,"chance").mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(play("OUT",rng).outcome).toBe("FC");
    expect(game.bases[0]?.responsiblePitcherId).toBe(starter.pitcherId);
    game.bases = [null,null,game.bases[0]];
    play("SF");
    expect(starter.runsAllowed).toBe(1);
    expect(reliever.runsAllowed).toBe(0);
  });
  it("교체 뒤 결승 주자가 득점해도 출루시킨 선발에게 실점·패전을 준다", () => {
    const {state,game,runner,play} = setup();
    game.inning = 9;
    const starter = game.pitchers[away]; starter.pitchCount = 150;
    game.bases = [null,null,runner(1)];
    checkPitchingChange(state,game,new SeededRng(1));
    const reliever = game.pitchers[away];
    play("SF"); updatePitchingDecision(game,0,0);
    expect(starter.runsAllowed).toBe(1);
    expect(reliever.runsAllowed).toBe(0);
    expect(makeSummary(game).losingPitcher).toBe(starter.name);
  });
  it.each([
    {lead:3,outs:1,tying:false,save:false},
    {lead:3,outs:3,tying:false,save:true},
    {lead:4,outs:1,tying:true,save:true},
    {lead:7,outs:9,tying:false,save:true},
    {lead:0,outs:9,tying:false,save:false},
  ])("등판 조건 $lead점/$outs아웃/$tying → 세이브 $save", ({lead,outs,tying,save}) => {
    const {game} = setup(), starter = game.pitchers[home];
    starter.outsRecorded = 18; ensurePitchingHistory(game);
    game.pitchers[home] = {...starter,pitcherId:"test-closer",name:"CP",isStarter:false,entryLead:lead,entryTyingRun:tying,outsRecorded:outs,usedPitcherIds:[starter.pitcherId,"test-closer"]};
    game.pitchingDecision = {leadingTeam:home,winningPitcher:{pitcherId:starter.pitcherId,name:starter.name},losingPitcher:game.pitchers[away]};
    expect(Boolean(pitchingAwards(game,home).savePitcher)).toBe(save);
    game.pitchers[home].leadLost = true;
    expect(pitchingAwards(game,home).savePitcher).toBeUndefined();
  });
  it("5이닝 미달 선발 대신 효과적인 구원에게 승리를 주며 승리·세이브는 중복하지 않는다", () => {
    const {game} = setup(), starter = game.pitchers[home];
    starter.outsRecorded = 12; ensurePitchingHistory(game);
    game.pitchers[home] = {...starter,pitcherId:"test-rp",name:"RP",isStarter:false,outsRecorded:15,runsAllowed:0,usedPitcherIds:[starter.pitcherId,"test-rp"],entryLead:2,entryTyingRun:true};
    game.pitchingDecision = {leadingTeam:home,winningPitcher:starter,losingPitcher:game.pitchers[away]};
    expect(pitchingAwards(game,home)).toEqual({winningPitcher:"RP",savePitcher:undefined});
  });
  it("옛 세이브에 등판·피로 정보가 없어도 불러올 수 있다", () => {
    const {state,game} = setup();
    delete game.pitchingHistory; delete state.pitcherWorkloads;
    expect(validateSave(JSON.parse(JSON.stringify(state))).game!.pitchingHistory).toBeDefined();
  });
});

describe("시뮬레이션 회귀: 도루와 투구 수", () => {
  it("speed 5도 2아웃 도루가 가능하고 실패는 투수 아웃 수에 포함된다", () => {
    const {state,game,runner,hitters} = setup();
    hitters[1].statProfile = {games:144,avg:.28,homeRuns:10,speed:5};
    game.outs = 2; game.bases = [runner(1),null,null];
    const pitcher = game.pitchers[away], before = pitcher.outsRecorded;
    const rng = new SeededRng(1);
    const chance = vi.spyOn(rng,"chance").mockReturnValueOnce(true).mockReturnValueOnce(false);
    maybeAutoSteal(state,game,rng);
    expect(chance).toHaveBeenNthCalledWith(2,.62);
    expect(state.playerStats[hitters[1].id].cs).toBe(1);
    expect(pitcher.outsRecorded).toBe(before+1);
  });
  it("IBB는 0구, BB는 최소 4구이며 안타도 1구로 끝날 수 있다", () => {
    const {game,play} = setup(), pitcher = game.pitchers[away];
    play("IBB"); expect(pitcher.pitchCount).toBe(0);
    play("BB"); expect(pitcher.pitchCount).toBeGreaterThanOrEqual(4);
    const before = pitcher.pitchCount, rng = new SeededRng(1);
    vi.spyOn(rng,"int").mockReturnValue(1);
    play("HR",rng); expect(pitcher.pitchCount-before).toBe(1);
  });
});
