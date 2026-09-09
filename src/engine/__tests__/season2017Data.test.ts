import { describe, expect, it } from "vitest";
import rawDataset from "../../data/seasons/2017-season-data.json";
import sourceRecords from "../../../docs/sources/2017-kbo-records.json";
import beforeBalance from "../../../docs/sources/2017-season-data-before-balance.json";
import balanceSettings from "../../../scripts/data/2017-team-balance.json";
import { validateLeagueDataset } from "../../data/leagueDataset";
import { applyUserChoice, createNewSeason, resolveUserSteal, validateSave } from "../gameEngine";
import { buildSeasonLineupPlan } from "../lineup";
import { calculatePitcherGrade } from "../pitcherGrade";

describe("2017 실제 기록 기반 리그 파일", () => {
  const dataset = validateLeagueDataset(rawDataset);
  const historical = validateLeagueDataset(beforeBalance);

  it("10개 팀에 9타자·5선발·4구원·1마무리를 배치하고 144경기 라인업을 채운다", () => {
    expect(Object.keys(dataset.teams)).toHaveLength(10);
    const ids = new Set<string>();
    for (const team of Object.values(dataset.teams)) {
      expect(team.hitters).toHaveLength(9);
      expect(team.pitchers.map((p) => p.role)).toEqual(["SP", "SP", "SP", "SP", "SP", "RP", "RP", "RP", "RP", "CP"]);
      for (const hitter of team.hitters) {
        expect(hitter.statProfile?.games).toBe(144);
        expect(Object.keys(hitter.statProfile ?? {}).sort()).toEqual(["avg", "eye", "games", "homeRuns", "speed"]);
      }
      const plan = buildSeasonLineupPlan(team, 2017);
      expect(plan).toHaveLength(144);
      expect(plan.every((lineup) => lineup.length === 9 && new Set(lineup).size === 9)).toBe(true);
      for (const p of [...team.hitters, ...team.pitchers]) {
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      }
    }
    expect(ids.size).toBe(190);
  });

  it("조정 전 백업에 실제 기록 기반 환산값과 투수 등급을 보존한다", () => {
    for (const team of Object.values(historical.teams)) {
      const source = sourceRecords.teams[team.id];
      team.hitters.forEach((hitter, index) => {
        const original = source.hitters[index];
        expect(hitter.name).toBe(original.name);
        expect(hitter.statProfile?.avg).toBe(original.stats.avg);
        expect(hitter.statProfile?.homeRuns).toBe(Math.round(original.stats.homeRuns * Math.min(2, 144 / original.stats.games)));
        expect(hitter.statProfile?.eye).toBe(Math.max(1, Math.min(10, Math.round((original.stats.walks / original.stats.plateAppearances - 0.048) / 0.008))));
        expect(original.stats.totalBases).toBe(original.stats.hits + original.stats.doubles + 2 * original.stats.triples + 3 * original.stats.homeRuns);
      });
      team.pitchers.forEach((pitcher, index) => {
        expect(pitcher.name).toBe(source.pitchers[index].name);
        expect(pitcher.statProfile).toBeUndefined();
        expect(pitcher.grade).toBe(calculatePitcherGrade(pitcher));
        const actual = source.pitchers[index].stats;
        expect(Math.abs(actual.era - actual.earnedRuns * 27 / actual.inningsOuts)).toBeLessThan(0.0051);
      });
    }
  });

  it("2017 소속 및 실제 기록을 사용하고 이적 선수나 다른 시즌 선수를 중복 배치하지 않는다", () => {
    const hitters = Object.values(dataset.teams).flatMap((t) => t.hitters);
    const pitchers = Object.values(dataset.teams).flatMap((t) => t.pitchers);
    expect(new Set(hitters.map((h) => h.name)).size).toBe(90);
    expect(new Set(pitchers.map((p) => p.name)).size).toBe(100);
    expect(dataset.teams.LOT.hitters.some((h) => h.name === "강민호")).toBe(true);
    expect(dataset.teams.DOO.hitters.some((h) => h.name === "민병헌")).toBe(true);
    expect(pitchers.some((p) => p.name === "김광현")).toBe(false);
    expect(historical.teams.KIA.hitters.find((h) => h.name === "김선빈")?.statProfile?.avg).toBe(0.370);
    expect(historical.teams.KIA.hitters.find((h) => h.name === "안치홍")?.statProfile?.homeRuns).toBe(23);
    expect(historical.teams.NEX.hitters.find((h) => h.name === "초이스")?.statProfile?.homeRuns).toBe(34);
    expect(historical.teams.KIA.pitchers.find((p) => p.name === "양현종")).toMatchObject({ stuff: 82, movement: 83, control: 81, stamina: 92, grade: "A" });
  });

  it("체급 조정값을 원본에 한 번 적용하고 선수·포지션·주루·투수 역할은 유지한다", () => {
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    expect(dataset.label).toBe(balanceSettings.label);
    for (const team of Object.values(dataset.teams)) {
      const original = historical.teams[team.id];
      const adjustment = balanceSettings.teams[team.id] as {
        avg: number; homeRuns: number; eye: number; pitching: number; stamina: number; strength: number;
        pitcherBonuses?: Record<string, number>;
      };
      expect(team.strength).toBe(adjustment.strength);
      team.hitters.forEach((hitter, index) => {
        const base = original.hitters[index];
        expect(hitter).toMatchObject({ id: base.id, name: base.name, position: base.position, bats: base.bats });
        expect(hitter.statProfile).toEqual({
          ...base.statProfile,
          avg: +clamp(base.statProfile!.avg + adjustment.avg, 0.170, 0.399).toFixed(3),
          homeRuns: Math.round(base.statProfile!.homeRuns * adjustment.homeRuns),
          eye: clamp(base.statProfile!.eye! + adjustment.eye, 1, 10),
        });
      });
      team.pitchers.forEach((pitcher, index) => {
        const base = original.pitchers[index];
        const delta = adjustment.pitching + (adjustment.pitcherBonuses?.[pitcher.name] ?? 0);
        expect(pitcher).toMatchObject({ id: base.id, name: base.name, throws: base.throws, role: base.role });
        for (const key of ["stuff", "movement", "control"] as const) expect(pitcher[key]).toBe(clamp(base[key] + delta, 15, 99));
        expect(pitcher.stamina).toBe(clamp(base.stamina + adjustment.stamina, 25, 99));
        expect(pitcher.grade).toBe(calculatePitcherGrade(pitcher));
      });
    }
  });

  it("각 팀으로 가져온 시즌이 경기 종료까지 진행되고 세이브에도 리그가 보존된다", () => {
    for (const team of Object.values(dataset.teams)) {
      let state = createNewSeason({ debutYear: 2017, userTeam: team.id, playerName: "검증 타자", seed: 2017 }, dataset);
      for (let step = 0; step < 100 && !state.game!.finalized; step += 1) {
        state = state.game!.phase === "WAITING_FOR_STEAL"
          ? resolveUserSteal(state, false)
          : applyUserChoice(state, step % 4 === 0 ? "1B" : "OUT");
      }
      expect(state.game!.finalized).toBe(true);
      expect(state.lastResults).toHaveLength(5);
      expect(state.teamRecords[team.id].games).toBe(1);
      const restored = validateSave(JSON.parse(JSON.stringify(state)));
      expect(restored.leagueData).toEqual(dataset);
    }
  });
});
