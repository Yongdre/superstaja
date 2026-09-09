import { describe, expect, it } from "vitest";
import { defaultLeagueDataset, validateLeagueDataset } from "../../data/leagueDataset";
import rawTemplate from "../../data/templates/kbo-league-data-template.json";
import { calculatePitcherGrade, getPitcherGrade } from "../pitcherGrade";
import { createNewSeason, validateSave } from "../gameEngine";

describe("투수 표시 등급", () => {
  it("세 능력치 평균을 반올림하지 않고 S/A/B/C/D 구간으로 나눈다", () => {
    for (const [score, grade] of [[100, "S"], [85, "S"], [84.99, "A"], [78, "A"], [77.99, "B"], [70, "B"], [69.99, "C"], [60, "C"], [59.99, "D"], [0, "D"]] as const) {
      expect(calculatePitcherGrade({ stuff: score, movement: score, control: score })).toBe(grade);
    }
    expect(calculatePitcherGrade({ stuff: 88, movement: 84, control: 83 })).toBe("S");
  });

  it("체력과 투수 역할은 등급을 낮추지 않는다", () => {
    for (const stamina of [0, 50, 100]) {
      for (const role of ["SP", "RP", "CP"] as const) {
        const pitcher = { stuff: 90, movement: 86, control: 82, stamina, role };
        expect(calculatePitcherGrade(pitcher)).toBe("S");
      }
    }
  });

  it("명시한 등급을 사용하고 등급이 없는 기존 JSON은 능력치로 표시한다", () => {
    const dataset = structuredClone(defaultLeagueDataset);
    const pitcher = dataset.teams.KIA.pitchers[0];
    pitcher.stuff = pitcher.movement = pitcher.control = 72;
    delete pitcher.grade;
    expect(getPitcherGrade(validateLeagueDataset(dataset).teams.KIA.pitchers[0])).toBe("B");
    pitcher.grade = "A";
    expect(getPitcherGrade(validateLeagueDataset(dataset).teams.KIA.pitchers[0])).toBe("A");
    const state = createNewSeason({ seed: 12 }, dataset);
    expect(validateSave(JSON.parse(JSON.stringify(state))).leagueData.teams.KIA.pitchers[0].grade).toBe("A");
  });

  it("잘못된 등급은 가져오기 단계에서 거부한다", () => {
    for (const grade of ["SS", "a", "", 85, null]) {
      const dataset = structuredClone(defaultLeagueDataset);
      Object.assign(dataset.teams.KIA.pitchers[0], { grade });
      expect(() => validateLeagueDataset(dataset)).toThrow(/grade는 S, A, B, C, D/);
    }
  });

  it("배포하는 원본 템플릿의 투수 100명에 능력치와 일치하는 등급이 있다", () => {
    const pitchers = Object.values(rawTemplate.teams).flatMap((team) => team.pitchers);
    expect(pitchers).toHaveLength(100);
    for (const pitcher of pitchers) expect(pitcher.grade).toBe(calculatePitcherGrade(pitcher));
  });

  it("표시 등급 변경은 경기 결과나 난수 상태를 바꾸지 않는다", () => {
    const original = createNewSeason({ seed: 26 }, defaultLeagueDataset);
    const dataset = structuredClone(defaultLeagueDataset);
    for (const team of Object.values(dataset.teams)) for (const pitcher of team.pitchers) pitcher.grade = "S";
    const labeled = createNewSeason({ seed: 26 }, dataset);
    expect(labeled.game).toEqual(original.game);
    expect(labeled.playerStats).toEqual(original.playerStats);
    expect(labeled.rngState).toBe(original.rngState);
  });
});
