import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultLeagueDataset, supportedTeamIds, validateLeagueDataset } from "../../data/leagueDataset";
import { teamStructure } from "../../data/mlbStructure";
import { PostseasonBracket } from "../../components/PostseasonBracket";
import { applyUserChoice, checkPitchingChange, createGame, createNewSeason, eligibleBullpenPitchers, resolveUserSteal, revealGameResult, startNextGame, startNextSeason, transitionAfterPlay, validateSave } from "../gameEngine";
import { advancePostseasonSeries, createPostseason, postseasonFixture, rankMlbTeams, recordPostseasonResult, seriesWinner } from "../postseason";
import { generateSchedule } from "../schedule";
import { SeededRng } from "../rng";
import type { SeasonState, TeamId } from "../types";

function step(state: SeasonState) {
  switch (state.game!.phase) {
    case "USER_AT_BAT": return applyUserChoice(state, "OUT");
    case "WAITING_FOR_STEAL": return resolveUserSteal(state, false);
    case "GAME_END_TRANSITION": return revealGameResult(state);
    case "GAME_END": return startNextGame(state);
    default: throw new Error(`Unexpected phase: ${state.game!.phase}`);
  }
}

describe("MLB 일정과 데이터", () => {
  it("공식 2430경기: 모든 팀 162경기, 홈81/원정81, 지구52/타지구62/인터리그48", () => {
    const games = generateSchedule(supportedTeamIds).flatMap(day => day.games);
    expect(games).toHaveLength(2430);
    expect(new Set(games.map(game => game.id)).size).toBe(2430);
    for (const id of supportedTeamIds) {
      const own = games.filter(game => game.away === id || game.home === id);
      expect(own).toHaveLength(162);
      expect(own.filter(game => game.home === id)).toHaveLength(81);
      const opponents = own.map(game => teamStructure[game.away === id ? game.home : game.away]);
      expect(opponents.filter(team => team.league !== teamStructure[id].league)).toHaveLength(48);
      expect(opponents.filter(team => team.league === teamStructure[id].league && team.division === teamStructure[id].division)).toHaveLength(52);
      expect(opponents.filter(team => team.league === teamStructure[id].league && team.division !== teamStructure[id].division)).toHaveLength(62);
    }
  });
  it("현재 기본 선수 데이터의 30개 구단은 모두 게임을 시작할 수 있다", () => {
    expect(validateLeagueDataset(defaultLeagueDataset).sourceSeason).toBe(defaultLeagueDataset.sourceSeason);
    for (const userTeam of supportedTeamIds) {
      const state = createNewSeason({ userTeam });
      expect([state.game!.fixture.away,state.game!.fixture.home]).toContain(userTeam);
      expect(state.game!.lineups[userTeam]).toHaveLength(9);
      expect(state.game!.lineups[userTeam]).toContain("USER-PLAYER");
    }
  });
  it("KBO 세이브와 데이터는 분리된다", () => {
    const state = createNewSeason();
    const restored = validateSave(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state);
    expect(() => validateSave({...state,edition:undefined})).toThrow("KBO");
    expect(() => validateLeagueDataset({...defaultLeagueDataset,teams:{LAD:defaultLeagueDataset.teams.LAD}})).toThrow("팀 ID");
  });
});

describe("MLB 경기 규칙", () => {
  it("정규시즌과 포스트시즌 모두 자동주자 없이 12회를 넘어 승부가 날 때까지 진행한다", () => {
    const state = createNewSeason();
    for (const stage of ["REGULAR_SEASON","WORLD_SERIES"] as const) {
      const game = createGame(state,state.game!.fixture,stage);
      game.inning=9; game.half="BOTTOM"; game.outs=3;
      transitionAfterPlay(state,game);
      expect(game.inning).toBe(10);
      expect(game.half).toBe("TOP");
      expect(game.bases).toEqual([null,null,null]);
      game.inning=18;game.outs=3;game.half="BOTTOM";
      transitionAfterPlay(state,game);
      expect(game.inning).toBe(19);
      expect(game.phase).not.toBe("GAME_END_TRANSITION");
      expect(game.bases).toEqual([null,null,null]);
      game.half="BOTTOM"; game.outs=0;game.score[game.fixture.home]=1;
      transitionAfterPlay(state,game);
      expect(game.phase).toBe("GAME_END_TRANSITION");
    }
  });
  it("모든 불펜을 소진해도 동일 투수가 재등판하지 않는다", () => {
    const state=createNewSeason(), game=createGame(state,state.game!.fixture,"WORLD_SERIES"), team=game.fixture.home;
    const rng=new SeededRng(1); vi.spyOn(rng,"chance").mockReturnValue(true);
    const seen=[game.pitchers[team].pitcherId], count=eligibleBullpenPitchers(team,state.leagueData,"WORLD_SERIES").length;
    for(let i=0;i<count+2;i++) {
      game.inning=12;game.pitchers[team].pitchCount=200;game.pitchers[team].outsRecorded=9;
      checkPitchingChange(state,game,rng);
      if(i<count) {expect(seen).not.toContain(game.pitchers[team].pitcherId);seen.push(game.pitchers[team].pitcherId);}
      else expect(game.pitchers[team].pitchCount).toBe(200);
    }
    expect(game.pitchers[team].usedPitcherIds).toEqual(seen);
  });
});

describe("MLB 포스트시즌", () => {
  it("지구 우승팀 3 + WC 3, 시드1/2 부전승, 고정 대진, 11개 시리즈 후 챔피언", () => {
    const state=createNewSeason();
    for(const id of supportedTeamIds) Object.assign(state.teamRecords[id],{games:162,wins:81,losses:81});
    Object.assign(state.teamRecords.NYY,{wins:100,losses:62});
    Object.assign(state.teamRecords.BOS,{wins:99,losses:63});
    const ps=createPostseason(state.teamRecords,{});
    expect(ps.seeds).toHaveLength(12);
    expect(ps.leagueSeeds.AL[0]).toBe("NYY");
    expect(ps.leagueSeeds.AL[3]).toBe("BOS");
    const stageCounts:Record<string,number>={};
    while(!ps.champion) {
      const series=ps.series;stageCounts[series.stage]=(stageCounts[series.stage]??0)+1;
      const pattern=series.stage==="WILD_CARD"?[true,true,true]:series.stage==="DIVISION_SERIES"?[true,true,false,false,true]:[true,true,false,false,false,true,true];
      for(let i=0;i<pattern.length;i++) expect(postseasonFixture({...series,gamesPlayed:i},0).home).toBe(pattern[i]?series.higherSeed:series.lowerSeed);
      // 양 리그 6번 시드가 WC에서 이겨도 2번 시드 경로를 유지합니다.
      const winner=series.id.endsWith("WC36")?series.lowerSeed:series.higherSeed;
      if(series.id.endsWith("DS2")) expect(series.lowerSeed).toBe(ps.leagueSeeds[series.league as "AL"|"NL"][5]);
      for(let i=0;i<series.neededWins;i++) recordPostseasonResult(ps,{away:series.lowerSeed,home:series.higherSeed,awayScore:winner===series.lowerSeed?1:0,homeScore:winner===series.higherSeed?1:0,winningPitcher:"",losingPitcher:""});
      expect(seriesWinner(series)).toBe(winner);
      advancePostseasonSeries(ps,state);
    }
    expect(stageCounts).toEqual({WILD_CARD:4,DIVISION_SERIES:4,CHAMPIONSHIP_SERIES:2,WORLD_SERIES:1});
    expect(ps.completedSeries).toHaveLength(11);
    state.postseason=ps;
    const html=renderToStaticMarkup(<PostseasonBracket state={state}/>);
    expect(html.match(/class="bracket-match/g)).toHaveLength(11);
    expect(html).toContain("WORLD CHAMPION");
    expect(html).toContain("NATIONAL LEAGUE");
  });
  it("동률 팀은 상대전적을 먼저 적용한다", () => {
    const state=createNewSeason();
    for(const id of ["LAD","SD"] as TeamId[]) Object.assign(state.teamRecords[id],{games:162,wins:90,losses:72});
    const h2h={"LAD:SD":{wins:6,losses:7,ties:0},"SD:LAD":{wins:7,losses:6,ties:0}};
    expect(rankMlbTeams(["LAD","SD"],state.teamRecords,h2h)).toEqual(["SD","LAD"]);
  });
  it("시리즈를 넘어 팀별 선발 순서를 유지한다", () => {
    const state=createNewSeason();state.postseason=createPostseason(state.teamRecords,{});
    for(let i=0;i<3;i++) state.postseason.games.push({seriesId:"NL-CS",stage:"CHAMPIONSHIP_SERIES",gameNumber:i+1,summary:{away:"LAD",home:"NYM",awayScore:1,homeScore:0,winningPitcher:"",losingPitcher:""}});
    const fixture={...state.game!.fixture,away:"LAD" as const,home:"NYY" as const};
    const game=createGame(state,fixture,"WORLD_SERIES");
    expect(game.pitchers.LAD.pitcherId).toBe(state.leagueData.teams.LAD.pitchers[3].id);
    expect(game.pitchers.NYY.pitcherId).toBe(state.leagueData.teams.NYY.pitchers[0].id);
  });
});

it("정규시즌 전체·휴식일·더블헤더·PS·다음 시즌·은퇴까지 진행한다", () => {
  let state=createNewSeason({userTeam:"LAD",seed:91,debutYear:2026,playerName:"MLB 테스트"});
  let steps=0;
  while(state.game!.phase!=="SEASON_END" && steps++<5000) state=step(state);
  expect(state.game!.phase).toBe("SEASON_END");
  expect(state.regularResults).toHaveLength(2430);
  expect(new Set(state.regularResults.map(result=>result.fixtureId)).size).toBe(2430);
  for(const id of supportedTeamIds) expect(state.teamRecords[id]).toMatchObject({games:162,homeGames:81,awayGames:81,ties:0});
  expect(state.postseason!.completedSeries).toHaveLength(11);
  expect(state.career.seasons).toHaveLength(1);
  const restored=validateSave(JSON.parse(JSON.stringify(state)));
  expect(restored.postseason!.champion).toBe(state.postseason!.champion);
  const next=startNextSeason(restored,{...state.config,stealSuccess:.85,isFinalSeason:true});
  expect(next.season).toBe(2027);
  expect(next.config.stealSuccess).toBe(.85);
  expect(next.career.seasons).toHaveLength(1);
  expect(next.postseason).toBeUndefined();
  expect(next.game!.fixture.date).toMatch(/^2027-/);
  state=next;
  steps=0;
  while(state.game!.phase!=="SEASON_END" && steps++<5000) state=step(state);
  expect(state.career.status).toBe("RETIRED");
  expect(state.career.seasons).toHaveLength(2);
  expect(state.career.finalSeason).toBe(2027);
},120000);

it.each(["NYY","LAD"] as TeamId[])("%s 사용자 팀이 포스트시즌에서 직접 타격하고 시리즈 기록을 남긴다", userTeam => {
  let state=createNewSeason({userTeam});
  state.teamRecords[userTeam].wins=100;
  state.postseason=createPostseason(state.teamRecords,structuredClone(state.playerStats));
  state.progress="POSTSEASON";
  state.game!.phase="GAME_END";
  state=startNextGame(state);
  expect(state.game!.competition).toBe("DIVISION_SERIES");
  expect([state.game!.fixture.away,state.game!.fixture.home]).toContain(userTeam);
  let choices=0;
  const phaseOf = (current: SeasonState) => current.game!.phase;
  for(let i=0;i<1000 && phaseOf(state)!=="SEASON_END";i++) {
    if(phaseOf(state)==="USER_AT_BAT") choices++;
    state=step(state);
  }
  expect(choices).toBeGreaterThan(0);
  expect(state.game!.phase).toBe("SEASON_END");
  expect(state.postseason!.games.filter(game=>game.userStats)).not.toHaveLength(0);
  expect(state.postseason!.playerStats["USER-PLAYER"].pa).toBe(choices);
});
