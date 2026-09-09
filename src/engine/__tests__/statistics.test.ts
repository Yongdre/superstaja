import { describe, expect, it } from "vitest";
import { avg, combinedWalks, emptyBatterStats, formatWalks, isQualified, obp, ops, slg, sumBatterStats, totalBases } from "../statistics";

describe("타격 통계", () => {
  it("AVG, OBP, SLG, OPS를 공식에 맞게 계산한다", () => {
    const stats = { ...emptyBatterStats(), pa: 115, ab: 100, h: 30, doubles: 8, triples: 2, hr: 5, bb: 10, hbp: 2, sf: 3 };
    expect(avg(stats)).toBeCloseTo(0.3);
    expect(obp(stats)).toBeCloseTo(42 / 115);
    expect(totalBases(stats)).toBe(57);
    expect(slg(stats)).toBeCloseTo(0.57);
    expect(ops(stats)).toBeCloseTo(42 / 115 + 0.57);
  });

  it("규정타석은 팀 경기 수 × 3.1을 사용한다", () => {
    expect(isQualified({ ...emptyBatterStats(), pa: 310 }, 100)).toBe(true);
    expect(isQualified({ ...emptyBatterStats(), pa: 309 }, 100)).toBe(false);
  });

  it("볼넷 합계는 사구를 더하고 IBB를 중복 합산하지 않는다", () => {
    const stats = { ...emptyBatterStats(), ab: 100, h: 30, bb: 40, ibb: 3, hbp: 5, sf: 2, sh: 8 };
    expect(combinedWalks(stats)).toBe(45);
    expect(formatWalks(stats)).toBe("45 (3, 5)");
    expect(obp(stats)).toBeCloseTo(75 / 147);
  });

  it("통산 루타와 볼넷은 시즌 합계로 계산하고 희생번트는 루타에 더하지 않는다", () => {
    const first = { ...emptyBatterStats(), ab: 100, h: 30, doubles: 8, triples: 2, hr: 5, bb: 10, ibb: 2, hbp: 3, sh: 4 };
    const second = { ...emptyBatterStats(), ab: 100, h: 20, doubles: 4, triples: 1, hr: 2, bb: 20, ibb: 1, hbp: 2, sh: 1 };
    const total = sumBatterStats([first, second]);
    expect(totalBases(total)).toBe(57 + 32);
    expect(formatWalks(total)).toBe("35 (3, 5)");
    expect(total.sh).toBe(5);
    expect(slg(total)).toBeCloseTo(89 / 200);
  });
});
