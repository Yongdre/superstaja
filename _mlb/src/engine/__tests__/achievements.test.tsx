import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { supportedTeamIds } from "../../data/leagueDataset";
import { CareerMilestones } from "../../components/CareerMilestones";
import { celebrationsForTransition } from "../../components/CycleCelebration";
import { careerStats } from "../career";
import { milestoneNotices, recordCareerMilestones } from "../achievements";
import { applyUserChoice, createGame, createNewSeason, resolveUserSteal, revealGameResult, startNextSeason, validateSave } from "../gameEngine";
import { emptyBatterStats } from "../statistics";
import type { Baserunner, UserChoice } from "../types";

function setup() {
  const state = createNewSeason({ userTeam: supportedTeamIds[0], playerName: "기록검증", enforceHomeRunCap: false, seed: 19 });
  const fixture = { ...state.game!.fixture };
  if (fixture.home !== state.config.userTeam) [fixture.home, fixture.away] = [fixture.away, fixture.home];
  state.game = createGame(state, fixture);
  const game = state.game;
  game.inning = 9;
  game.half = "BOTTOM";
  game.phase = "USER_AT_BAT";
  game.battingIndex[state.config.userTeam] = game.lineups[state.config.userTeam].indexOf("USER-PLAYER");
  const runner = (index: number): Baserunner => {
    const hitter = state.leagueData.teams[state.config.userTeam].hitters[index];
    return { playerId: hitter.id, name: hitter.name, teamId: state.config.userTeam, speed: hitter.speed, isUser: false };
  };
  return { state, runner };
}

describe("끝내기 연출", () => {
  it.each(["1B", "HR", "SF", "BB", "HBP"] as const)("%s의 실제 끝내기 결과와 팀 승리를 순서대로 표시한다", choice => {
    const { state, runner } = setup();
    state.game!.bases = choice === "BB" || choice === "HBP"
      ? [runner(0), runner(1), runner(2)] : [null, null, runner(2)];
    const after = applyUserChoice(state, choice as UserChoice);
    expect(after.game!.walkOff).toMatchObject({ batterId: "USER-PLAYER", outcome: choice });
    expect(after.game!.phase).toBe("GAME_END_TRANSITION");
    const notices = celebrationsForTransition(state, after);
    const walkOff = notices.findIndex(notice => notice.label === "WALK-OFF");
    expect(walkOff).toBeGreaterThanOrEqual(0);
    expect(notices[walkOff].text).toContain("끝내기");
    expect(notices[walkOff + 1].text).toBe(after.leagueData.teams[state.config.userTeam].name + " 승리!");
    expect(celebrationsForTransition(after, revealGameResult(after))).toEqual([]);
  });

  it("9회초 원정 홈런과 홈팀 리드의 경기 종료를 끝내기로 처리하지 않는다", () => {
    const { state } = setup();
    const away = state.game!.fixture.away;
    const home = state.config.userTeam;
    // 사용자 팀을 원정으로 옮겨 홈팀의 큰 리드에서 9회초 타석을 진행합니다.
    state.game = createGame(state, { ...state.game!.fixture, home: away, away: home });
    state.game.half = "TOP";
    state.game.inning = 9;
    state.game.phase = "USER_AT_BAT";
    state.game.battingIndex[home] = state.game.lineups[home].indexOf("USER-PLAYER");
    state.game.score[away] = 99;
    const after = applyUserChoice(state, "HR");
    expect(after.game!.walkOff).toBeUndefined();
    expect(celebrationsForTransition(state, after).some(notice => notice.label === "WALK-OFF")).toBe(false);
  });
});

describe("기록 달성과 이력 보존", () => {
  it.each([{ hits: 1000, hr: 100 }, { hits: 2000, hr: 200 }])("통산 $hits 안타·$hr 홈런과 시즌 기준을 같은 타석에서 처리한다", ({ hits, hr }) => {
    const { state } = setup();
    state.career.seasons.push({
      season: state.season - 1, teamId: state.config.userTeam,
      playerStats: { ...emptyBatterStats(), h: hits - 50, hr: hr - 10 },
      teamRecord: { ...state.teamRecords[state.config.userTeam] }, goals: { ...state.config },
    });
    state.playerStats["USER-PLAYER"] = { ...emptyBatterStats(), pa: 120, ab: 120, h: 49, hr: 9 };
    const beforeTotals = careerStats(state);
    const after = applyUserChoice(state, "HR");
    expect(after.career.milestones!.map(record => [record.stat, record.value])).toEqual([["h", hits], ["hr", hr]]);
    for (const record of after.career.milestones!) {
      expect(record).toMatchObject({
        season: state.season, fixtureId: state.game!.fixture.id,
        gameNumber: state.teamRecords[state.config.userTeam].games + 1,
        inning: 9, half: "BOTTOM",
        opponentId: state.game!.fixture.away,
        opponentName: state.leagueData.teams[state.game!.fixture.away].name,
        date: state.game!.fixture.date,
      });
    }
    expect(milestoneNotices(state, after).map(notice => notice.text)).toEqual([
      "시즌 50안타 달성!", "시즌 10홈런 달성!",
      `통산 ${hits.toLocaleString("ko-KR")}안타 달성!`, `통산 ${hr}홈런 달성!`,
    ]);
    recordCareerMilestones(after, after.game!, beforeTotals);
    expect(after.career.milestones).toHaveLength(2);
    const restored = validateSave(JSON.parse(JSON.stringify(after)));
    expect(restored.career.milestones).toEqual(after.career.milestones);
    restored.game!.phase = "SEASON_END";
    const next = startNextSeason(restored, { ...restored.config });
    expect(next.career.milestones).toEqual(restored.career.milestones);
    const html = renderToStaticMarkup(<CareerMilestones state={next} />);
    expect(html).toContain("통산 기록 달성");
    expect(html).toContain(after.career.milestones![0].opponentName);
    expect(html).toContain("9회말");
    if (state.game!.fixture.date) expect(html).toContain(state.game!.fixture.date);
  });

  it("도루 성공 시 시즌 10도루를 알리고 통산 이력에는 남기지 않는다", () => {
    const { state } = setup();
    const game = state.game!;
    game.inning = 1;
    game.phase = "WAITING_FOR_STEAL";
    game.bases = [{ playerId: "USER-PLAYER", name: state.config.playerName, teamId: state.config.userTeam, speed: 76, isUser: true }, null, null];
    state.playerStats["USER-PLAYER"].sb = 9;
    state.config.stealSuccess = .95;
    state.rngState = 1;
    const after = resolveUserSteal(state, true);
    expect(after.playerStats["USER-PLAYER"].sb).toBe(10);
    expect(milestoneNotices(state, after).map(notice => notice.text)).toEqual(["시즌 10도루 달성!"]);
    expect(after.career.milestones).toEqual([]);
  });

  it("완료 시즌을 아카이브해도 현재 기록을 통산에 중복 합산하지 않는다", () => {
    const { state } = setup();
    state.playerStats["USER-PLAYER"] = { ...emptyBatterStats(), h: 999, hr: 99 };
    const after = structuredClone(state);
    after.playerStats["USER-PLAYER"].h++;
    after.playerStats["USER-PLAYER"].hr++;
    after.career.seasons.push({
      season: after.season, teamId: after.config.userTeam,
      playerStats: { ...after.playerStats["USER-PLAYER"] },
      teamRecord: after.teamRecords[after.config.userTeam], goals: { ...after.config },
    });
    expect(milestoneNotices(state, after).filter(notice => notice.label === "CAREER MILESTONE").map(notice => notice.text))
      .toEqual(["통산 1,000안타 달성!", "통산 100홈런 달성!"]);
  });

  it("포스트시즌과 이전 세이브의 기존 기록을 새 달성으로 알리지 않는다", () => {
    const { state } = setup();
    state.playerStats["USER-PLAYER"] = { ...emptyBatterStats(), h: 1001, hr: 101 };
    delete state.career.milestones;
    const restored = validateSave(JSON.parse(JSON.stringify(state)));
    expect(restored.career.milestones).toEqual([]);
    expect(milestoneNotices(state, restored)).toEqual([]);
    state.game!.competition = "WILD_CARD";
    const after = structuredClone(state);
    after.playerStats["USER-PLAYER"].h = 1050;
    after.playerStats["USER-PLAYER"].hr = 110;
    recordCareerMilestones(after, after.game!, careerStats(state));
    expect(after.career.milestones).toBeUndefined();
    expect(milestoneNotices(state, after)).toEqual([]);
  });

  it("잘못된 통산 달성 이력을 저장 불러오기에서 거부한다", () => {
    const { state } = setup();
    state.career.milestones = [{
      stat: "hr", value: 99, season: state.season, fixtureId: state.game!.fixture.id,
      gameNumber: 1, inning: 9, half: "BOTTOM",
      opponentId: state.game!.fixture.away, opponentName: "상대",
    }];
    expect(() => validateSave(state)).toThrow("통산 기록 달성");
  });
});

