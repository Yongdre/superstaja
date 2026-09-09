import { describe, expect, it } from "vitest";
import { defaultLeagueDataset } from "../../data/leagueDataset";
import { applyUserChoice, createExampleSave, createNewSeason, resolveUserSteal, revealGameResult, startNextGame, startNextSeason, validateSave } from "../gameEngine";
import { SeededRng } from "../rng";
import { calculateStandings, recordGame } from "../standings";
import type { TeamId, TeamRecord } from "../types";

const emptyRecord = (): TeamRecord => ({ games: 0, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, homeGames: 0, awayGames: 0 });
const ids: TeamId[] = ["KIA", "DOO", "LOT", "NC", "SK", "LG", "NEX", "HAN", "KT", "SAM"];

describe("시즌 상태", () => {
  it("승패와 홈/원정 경기 수를 기록한다", () => {
    const records = Object.fromEntries(ids.map((id) => [id, emptyRecord()])) as Record<TeamId, TeamRecord>;
    recordGame(records, "DOO", "SAM", 3, 5);
    expect(records.SAM).toMatchObject({ games: 1, wins: 1, homeGames: 1, runsFor: 5, runsAgainst: 3 });
    expect(records.DOO).toMatchObject({ games: 1, losses: 1, awayGames: 1 });
  });

  it("무승부는 승률 계산에서 제외하고 순위를 계산한다", () => {
    const records = Object.fromEntries(ids.map((id) => [id, emptyRecord()])) as Record<TeamId, TeamRecord>;
    recordGame(records, "DOO", "SAM", 4, 4);
    recordGame(records, "KIA", "LOT", 1, 0);
    expect(records.SAM.ties).toBe(1);
    const standings = calculateStandings(records);
    expect(standings[0].teamId).toBe("KIA");
    expect(standings.find((row) => row.teamId === "SAM")!.pct).toBe(0);
  });

  it("JSON 저장/복원 후 상태가 일치한다", () => {
    const state = createNewSeason({ seed: 77 });
    const restored = validateSave(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state);
  });

  it("동일 seed는 동일한 자동 경기 상태를 재현한다", () => {
    expect(createNewSeason({ seed: 2017 })).toEqual(createNewSeason({ seed: 2017 }));
    const a = new SeededRng(2017);
    const b = new SeededRng(2017);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it("선택한 포지션과 타순으로 사용자 선수를 라인업에 배치한다", () => {
    const state = createNewSeason({ playerName: "테스트 타자", position: "CF", battingOrder: 4 });
    const lineup = state.game!.lineups[state.config.userTeam];
    expect(state.config.position).toBe("CF");
    expect(lineup).toHaveLength(9);
    expect(lineup[3]).toBe("USER-PLAYER");
  });

  it("사용자 선택 결과를 중계 스크롤 기준점으로 저장한다", () => {
    const state = createExampleSave();
    const expectedLogId = state.game!.nextLogId;
    const next = applyUserChoice(state, "OUT");
    expect(next.game!.focusLogId).toBe(expectedLogId);
    expect(next.game!.log.find((entry) => entry.id === expectedLogId)?.text).toContain("이용호");
  });

  it("경기 종료 중계를 먼저 보여준 뒤 결과 화면으로 전환한다", () => {
    const state = createExampleSave();
    state.game!.inning = 9;
    state.game!.half = "BOTTOM";
    state.game!.outs = 2;
    state.game!.score.SAM = 3;
    state.game!.score.DOO = 1;
    const finished = applyUserChoice(state, "OUT");
    expect(finished.game!.phase).toBe("GAME_END_TRANSITION");
    expect(finished.game!.log.at(-1)?.text).toContain("경기 종료");
    expect(finished.lastResults).toHaveLength(5);
    expect(revealGameResult(finished).game!.phase).toBe("GAME_END");
  });

  it("마무리투수가 동점 상황을 막고 끝내기 승리를 거두면 승리만 기록한다", () => {
    const state = createExampleSave();
    state.game!.inning = 9;
    state.game!.half = "BOTTOM";
    state.game!.outs = 2;
    state.game!.bases = [null, null, null];
    state.game!.score.SAM = 3;
    state.game!.score.DOO = 3;
    state.game!.pitchers.SAM = {
      ...state.game!.pitchers.SAM,
      pitcherId: "SAM-CP",
      name: "삼성 마무리",
      isStarter: false,
    };

    const finished = applyUserChoice(state, "HR");

    expect(finished.game!.summary?.winningPitcher).toBe("삼성 마무리");
    expect(finished.game!.summary?.savePitcher).toBeUndefined();
  });

  it("리드를 만든 투수와 경기를 끝낸 마무리가 다르면 세이브를 기록한다", () => {
    const state = createExampleSave();
    state.game!.inning = 9;
    state.game!.half = "TOP";
    state.game!.outs = 2;
    state.game!.bases = [null, null, null];
    state.game!.score.SAM = 4;
    state.game!.score.DOO = 2;
    state.game!.pitchingDecision = {
      leadingTeam: "SAM",
      winningPitcher: { pitcherId: "SAM-SP", name: "삼성 선발" },
      losingPitcher: { pitcherId: "DOO-SP", name: "두산 선발" },
    };
    state.game!.pitchers.SAM = {
      ...state.game!.pitchers.SAM,
      pitcherId: "SAM-CP",
      name: "삼성 마무리",
      isStarter: false,
    };

    const finished = applyUserChoice(state, "OUT");

    expect(finished.game!.summary?.winningPitcher).toBe("삼성 선발");
    expect(finished.game!.summary?.savePitcher).toBe("삼성 마무리");
  });

  it("다음 시즌으로 넘어가면서 시즌 기록을 초기화하고 커리어 이력을 보존한다", () => {
    const state = createNewSeason({ debutYear: 2016, seed: 16 });
    state.game!.phase = "SEASON_END";
    state.playerStats["USER-PLAYER"].ab = 500;
    state.playerStats["USER-PLAYER"].h = 150;
    state.career.seasons.push({ season: 2016, teamId: "SAM", playerStats: { ...state.playerStats["USER-PLAYER"] }, teamRecord: { ...state.teamRecords.SAM, games: 144 }, goals: { battingOrder: 2, targetAvgMin: 0.3, targetAvgMax: 0.31, homeRunCap: 20, enforceHomeRunCap: true, isFinalSeason: false } });
    const next = startNextSeason(state, { battingOrder: 5, targetAvgMin: 0.32, targetAvgMax: 0.33, homeRunCap: 35, enforceHomeRunCap: true, isFinalSeason: true });
    expect(next.season).toBe(2017);
    expect(next.career.seasons).toHaveLength(1);
    expect(next.career.seasons[0].playerStats.h).toBe(150);
    expect(next.playerStats["USER-PLAYER"].h).toBe(0);
    expect(next.currentDay).toBe(0);
    expect(next.schedule[0].games[0].id).toContain("2017-");
    expect(next.config.targetAvgMin).toBe(0.32);
    expect(next.config.battingOrder).toBe(5);
    expect(next.config.homeRunCap).toBe(35);
    expect(next.config.isFinalSeason).toBe(true);
    expect(next.career.finalSeason).toBe(2017);
  });

  it("다음 시즌을 시작할 때 해당 연도의 리그 데이터로 교체할 수 있다", () => {
    const state = createNewSeason({ debutYear: 2098 });
    state.game!.phase = "SEASON_END";
    const dataset2099 = structuredClone(defaultLeagueDataset);
    dataset2099.sourceSeason = 2099;
    dataset2099.label = "2099 가상 KBO";
    dataset2099.teams.SAM.name = "달빛 라이온즈";
    const next = startNextSeason(state, { battingOrder: 3, targetAvgMin: 0.3, targetAvgMax: 0.31, homeRunCap: 30, enforceHomeRunCap: true, isFinalSeason: false }, dataset2099);
    expect(next.season).toBe(2099);
    expect(next.leagueData.label).toBe("2099 가상 KBO");
    expect(next.leagueData.teams.SAM.name).toBe("달빛 라이온즈");
  });

  it("schema v1 세이브를 커리어 형식으로 자동 변환한다", () => {
    const legacy = createExampleSave() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.career;
    const migrated = validateSave(legacy);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.career.debutYear).toBe(2017);
    expect(migrated.leagueData.label).toContain("2017");
    expect(migrated.config.isFinalSeason).toBe(false);
  });

  it("schema v2 세이브도 고정 은퇴 연도 없이 변환한다", () => {
    const legacy = createExampleSave() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    delete legacy.leagueData;
    const career = legacy.career as Record<string, unknown>;
    career.retirementYear = 2035;
    const migrated = validateSave(legacy);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.career).not.toHaveProperty("retirementYear");
    expect(migrated.career.status).toBe("ACTIVE");
    expect(migrated.leagueData.teams.SAM.hitters).toHaveLength(9);
  });

  it("기존 schema v4 세이브에 포지션과 시즌 타순이 없으면 기본값을 채운다", () => {
    const legacy = createExampleSave() as unknown as Record<string, unknown>;
    const config = legacy.config as Record<string, unknown>;
    delete config.position;
    const career = legacy.career as { seasons: Array<{ goals: Record<string, unknown> }> };
    career.seasons.push({ goals: { targetAvgMin: 0.3, targetAvgMax: 0.31, homeRunCap: 30, enforceHomeRunCap: true, isFinalSeason: false } });
    const migrated = validateSave(legacy);
    expect(migrated.config.position).toBe("2B");
    expect(migrated.career.seasons[0].goals.battingOrder).toBe(2);
  });

  it("마지막 시즌으로 지정한 시즌 종료 시 커리어를 마친다", () => {
    const state = createExampleSave();
    state.currentDay = 143;
    state.config.isFinalSeason = true;
    state.game!.inning = 9;
    state.game!.half = "BOTTOM";
    state.game!.outs = 2;
    state.game!.score.SAM = 3;
    state.game!.score.DOO = 1;
    let completed = applyUserChoice(state, "HR");
    expect(completed.progress).toBe("POSTSEASON");
    expect(completed.career.status).toBe("ACTIVE");
    for (let step = 0; step < 3000 && completed.game!.phase !== "SEASON_END"; step += 1) {
      if (completed.game!.phase === "USER_AT_BAT") completed = applyUserChoice(completed, "OUT");
      else if (completed.game!.phase === "WAITING_FOR_STEAL") completed = resolveUserSteal(completed, false);
      else if (completed.game!.phase === "GAME_END_TRANSITION") completed = revealGameResult(completed);
      else if (completed.game!.phase === "GAME_END") completed = startNextGame(completed);
    }
    expect(completed.game!.phase).toBe("SEASON_END");
    expect(completed.career.status).toBe("RETIRED");
    expect(completed.career.finalSeason).toBe(2017);
    expect(completed.career.seasons.at(-1)?.goals.isFinalSeason).toBe(true);
    expect(completed.career.seasons.at(-1)?.postseason?.champion).toBeDefined();
  });
});
