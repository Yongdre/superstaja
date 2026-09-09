import { describe, expect, it } from "vitest";
import { builtInLeagueDatasets, defaultLeagueDataset, getBuiltInLeagueDataset, leagueDataTemplate, validateLeagueDataset } from "../../data/leagueDataset";
import { createNewSeason } from "../gameEngine";
import { buildSeasonLineupPlan } from "../lineup";

describe("사용자 리그 데이터", () => {
  it("성적 입력 템플릿에 10팀, 팀당 타자 9명과 투수 10명이 있다", () => {
    const teams = Object.values(leagueDataTemplate.teams);
    expect(teams).toHaveLength(10);
    teams.forEach((team) => {
      expect(team.hitters).toHaveLength(9);
      expect(team.pitchers).toHaveLength(10);
      expect(team.hitters.every((hitter) => JSON.stringify(Object.keys(hitter.statProfile ?? {}).sort()) === JSON.stringify(["avg", "eye", "games", "homeRuns", "speed"]))).toBe(true);
      expect(team.pitchers.every((pitcher) => [pitcher.stuff, pitcher.movement, pitcher.control, pitcher.stamina].every((rating) => rating >= 0 && rating <= 100))).toBe(true);
      expect(team.pitchers.every((pitcher) => pitcher.statProfile === undefined)).toBe(true);
    });
  });

  it("연도별 JSON 파일을 내장 데이터로 자동 등록한다", () => {
    expect(builtInLeagueDatasets.map((dataset) => dataset.sourceSeason)).toContain(2017);
    expect(getBuiltInLeagueDataset(2017)?.label).toBe("2017 KBO 근사 데이터");
    expect(getBuiltInLeagueDataset(2099)).toBeUndefined();
  });

  it("수정한 팀과 선수 데이터를 새 커리어에 포함한다", () => {
    const dataset = structuredClone(defaultLeagueDataset);
    dataset.label = "2099 가상 리그";
    dataset.teams.KIA.name = "화성 타이거즈";
    dataset.teams.KIA.hitters[0].name = "가상선수 001";
    dataset.teams.KIA.hitters[0].contact = 99;
    const validated = validateLeagueDataset(dataset);
    const state = createNewSeason({ debutYear: 2099 }, validated);
    expect(state.leagueData.label).toBe("2099 가상 리그");
    expect(state.leagueData.teams.KIA.name).toBe("화성 타이거즈");
    expect(state.playerStats[dataset.teams.KIA.hitters[0].id]).toBeDefined();
  });

  it("잘못된 능력치 범위를 거부한다", () => {
    const dataset = structuredClone(defaultLeagueDataset);
    dataset.teams.KIA.hitters[0].power = 101;
    expect(() => validateLeagueDataset(dataset)).toThrow(/0–100/);
  });

  it("예상 성적으로 타자와 투수 능력치를 자동 추정한다", () => {
    const dataset = structuredClone(defaultLeagueDataset) as unknown as Record<string, any>;
    const hitter = dataset.teams.KIA.hitters[0];
    delete hitter.contact;
    delete hitter.power;
    delete hitter.discipline;
    delete hitter.speed;
    hitter.position = "RF,2B,3B,SS";
    hitter.statProfile = { games: 144, avg: 0.324, homeRuns: 20, stolenBases: 23, onBasePct: 0.39 };
    const pitcher = dataset.teams.KIA.pitchers[0];
    delete pitcher.stuff;
    delete pitcher.movement;
    delete pitcher.control;
    delete pitcher.stamina;
    pitcher.statProfile = { era: 3.23, innings: 160, strikeouts: 150, walks: 45 };
    const validated = validateLeagueDataset(dataset);
    expect(validated.teams.KIA.hitters[0].contact).toBeGreaterThan(75);
    expect(validated.teams.KIA.hitters[0].power).toBeGreaterThanOrEqual(70);
    expect(validated.teams.KIA.pitchers[0].stamina).toBeGreaterThan(75);
    expect(validated.teams.KIA.pitchers[0].movement).toBeGreaterThan(50);
  });

  it("movement는 0–100 범위를 검증하고 기존 JSON은 stuff로 보완한다", () => {
    const dataset = structuredClone(defaultLeagueDataset) as unknown as Record<string, any>;
    delete dataset.teams.KIA.pitchers[0].movement;
    expect(validateLeagueDataset(dataset).teams.KIA.pitchers[0].movement).toBe(dataset.teams.KIA.pitchers[0].stuff);
    dataset.teams.KIA.pitchers[1].movement = 101;
    expect(() => validateLeagueDataset(dataset)).toThrow(/0–100/);
  });

  it("타자의 eye와 speed는 1–10 정수만 허용하고 5를 평균 능력치로 변환한다", () => {
    const dataset = structuredClone(leagueDataTemplate) as unknown as Record<string, any>;
    const hitter = dataset.teams.KIA.hitters[0];
    hitter.statProfile.eye = 5;
    hitter.statProfile.speed = 5;
    const validated = validateLeagueDataset(dataset);
    expect(validated.teams.KIA.hitters[0].discipline).toBe(55);
    expect(validated.teams.KIA.hitters[0].speed).toBe(55);
    hitter.statProfile.eye = 0;
    expect(() => validateLeagueDataset(dataset)).toThrow(/eye는 1–10/);
  });

  it("부상 주전의 결장 경기를 멀티 포지션 백업이 채운다", () => {
    const dataset = structuredClone(defaultLeagueDataset) as unknown as Record<string, any>;
    const starter = dataset.teams.KIA.hitters.find((hitter: any) => hitter.position === "SS");
    starter.statProfile = { games: 100, avg: 0.31, homeRuns: 4 };
    starter.availability = "INJURY";
    dataset.teams.KIA.hitters.push({
      id: "KIA-BACKUP-IF",
      name: "멀티 백업",
      position: "2B,3B,SS",
      bats: "R",
      statProfile: { games: 44, avg: 0.245, homeRuns: 2, stolenBases: 4 },
    });
    const team = validateLeagueDataset(dataset).teams.KIA;
    const plan = buildSeasonLineupPlan(team, 2099);
    expect(plan).toHaveLength(144);
    expect(plan.every((lineup) => lineup.length === 9 && new Set(lineup).size === 9)).toBe(true);
    expect(plan.filter((lineup) => lineup.includes(starter.id))).toHaveLength(100);
    expect(plan.filter((lineup) => lineup.includes("KIA-BACKUP-IF"))).toHaveLength(44);
  });

  it("잘못된 멀티 포지션 표기를 거부한다", () => {
    const dataset = structuredClone(defaultLeagueDataset);
    dataset.teams.KIA.hitters[0].position = "2B,마법사";
    expect(() => validateLeagueDataset(dataset)).toThrow(/지원하지 않는 수비 위치/);
  });

  it("백업 없이 목표 출장 합계가 1,296경기보다 적으면 거부한다", () => {
    const dataset = structuredClone(defaultLeagueDataset);
    dataset.teams.KIA.hitters[0].statProfile = { games: 100, avg: 0.3, homeRuns: 10 };
    expect(() => validateLeagueDataset(dataset)).toThrow(/1,296경기/);
  });
});
