import { describe, expect, it } from "vitest";
import peopleJson from "../../../docs/sources/mlb-2016-people.json?raw";
import recordsJson from "../../../docs/sources/mlb-2016-records.json?raw";
import auditJson from "../../../docs/2016-compression-audit.json?raw";
import { defaultLeagueDataset, getBuiltInLeagueDataset, leagueDataTemplate, validateLeagueDataset } from "../../data/leagueDataset";
import { calculatePitcherGrade } from "../pitcherGrade";

const historicalDataset = getBuiltInLeagueDataset(2016);
const data = historicalDataset ?? defaultLeagueDataset;

describe("2016 실제 MLB 기록 압축 데이터", () => {
  it.runIf(Boolean(historicalDataset))("30팀·타자 9명·선발 5명·불펜 6명, 실존 선수 600명을 중복 없이 배치한다", () => {
    const valid = validateLeagueDataset(data);
    const people = JSON.parse(peopleJson) as { id: number; name: string; batSide: string; pitchHand: string }[];
    const identity = new Map(people.map(p => [p.id, p]));
    const ids: number[] = [];
    expect(Object.keys(valid.teams)).toHaveLength(30);
    for (const team of Object.values(valid.teams)) {
      expect(team.hitters).toHaveLength(9);
      expect(team.pitchers).toHaveLength(11);
      expect(team.hitters.map(p => p.position).sort()).toEqual(["C","1B","2B","3B","SS","LF","CF","RF","DH"].sort());
      expect(team.pitchers.filter(p => p.role === "SP")).toHaveLength(5);
      expect(team.pitchers.filter(p => p.role === "RP")).toHaveLength(5);
      expect(team.pitchers.filter(p => p.role === "CP")).toHaveLength(1);
      for (const player of [...team.hitters, ...team.pitchers]) {
        const id = Number(player.id.split("-")[1]);
        ids.push(id);
        expect(identity.get(id)?.name).toBe(player.name);
      }
      for (const hitter of team.hitters) {
        expect(hitter.statProfile?.games).toBe(162);
        expect(hitter.bats).toBe(identity.get(Number(hitter.id.split("-")[1]))?.batSide);
        expect(hitter.statProfile?.avg).toBeGreaterThanOrEqual(.15);
        expect(hitter.statProfile?.avg).toBeLessThanOrEqual(.399);
      }
      for (const pitcher of team.pitchers) {
        expect(pitcher.grade).toBe(calculatePitcherGrade(pitcher));
        expect(pitcher.statProfile).toBeUndefined();
        for (const key of ["stuff","movement","control","stamina"] as const) {
          expect(pitcher[key]).toBeGreaterThanOrEqual(25);
          expect(pitcher[key]).toBeLessThanOrEqual(97);
        }
      }
    }
    expect(new Set(ids).size).toBe(600);
    expect(Object.values(valid.teams).flatMap(t => t.hitters).some(p => p.bats === "S")).toBe(true);
    expect(historicalDataset!.sourceSeason).toBe(2016);
    expect(leagueDataTemplate).toEqual(defaultLeagueDataset);
  });

  it.runIf(Boolean(historicalDataset))("기준 원본에 2016 기록을 보존하고 주요 선수와 당시 구단명을 포함한다", () => {
    const source = JSON.parse(recordsJson);
    expect(source.season).toBe(2016);
    expect(source.teams.find((t: any) => t.team.id === "BOS").hitting.find((p: any) => p.name === "David Ortiz").homeRuns).toBe(38);
    expect(source.teams.find((t: any) => t.team.id === "LAD").pitching.find((p: any) => p.name === "Clayton Kershaw").outs).toBe(447);
    expect(data.teams.ATH.name).toBe("Oakland Athletics");
    expect(data.teams.CLE.name).toBe("Cleveland Indians");
    expect(data.teams.TEX.pitchers.some(p => p.name === "Yu Darvish")).toBe(true);
    expect(data.teams.CHC.pitchers.find(p => p.name === "Aroldis Chapman")?.role).toBe("CP");
    expect(data.teams.LAA.hitters.some(p => p.name === "Mike Trout")).toBe(true);
  });

  it("백업·나머지 투수의 기록이 압축 계산에서 누락되지 않는다", () => {
    const audit = JSON.parse(auditJson);
    for (const team of Object.values(audit.teams) as any[]) {
      for (const [key, total] of Object.entries(team.hitting.sourceTotals)) {
        const merged = team.hitting.buckets.reduce((sum: number, p: any) => sum + p.merged[key], 0);
        expect(merged).toBeCloseTo(total as number, 5);
      }
      for (const group of team.pitching.filter((p: any) => p.group)) {
        for (const key of Object.keys(group.targetRates)) {
          expect(group.meanCompressedRates[key]).toBeCloseTo(group.targetRates[key], 6);
        }
      }
    }
  });

  it("스위치 타자만 추가로 허용하고 잘못된 손잡이 정보는 거부한다", () => {
    const invalid = structuredClone(data);
    (invalid.teams.LAD.hitters[0] as unknown as {bats: string}).bats = "X";
    expect(() => validateLeagueDataset(invalid)).toThrow("bats");
  });
});
