import type { BatterStats } from "./types";

export const emptyBatterStats = (): BatterStats => ({
  pa: 0,
  ab: 0,
  h: 0,
  doubles: 0,
  triples: 0,
  hr: 0,
  rbi: 0,
  runs: 0,
  bb: 0,
  ibb: 0,
  hbp: 0,
  sf: 0,
  sh: 0,
  so: 0,
  sb: 0,
  cs: 0,
  gidp: 0,
  roe: 0,
});

export const singles = (s: BatterStats) => s.h - s.doubles - s.triples - s.hr;
export const totalBases = (s: BatterStats) => singles(s) + s.doubles * 2 + s.triples * 3 + s.hr * 4;
// BB에는 IBB가 이미 포함됩니다. 화면의 합계만 HBP를 더합니다.
export const combinedWalks = (s: BatterStats) => s.bb + s.hbp;
export const formatWalks = (s: BatterStats) => `${combinedWalks(s)} (${s.ibb}, ${s.hbp})`;
export const walksLabel = "볼넷(고의사구, 사구)";
export const avg = (s: BatterStats) => (s.ab ? s.h / s.ab : 0);
export const obp = (s: BatterStats) => {
  const denominator = s.ab + s.bb + s.hbp + s.sf;
  return denominator ? (s.h + s.bb + s.hbp) / denominator : 0;
};
export const slg = (s: BatterStats) => (s.ab ? totalBases(s) / s.ab : 0);
export const ops = (s: BatterStats) => obp(s) + slg(s);
export const isQualified = (s: BatterStats, teamGames: number) => s.pa >= teamGames * 3.1;

export const formatRate = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return ".000";
  return value.toFixed(3).replace(/^0/, "");
};

export function sumBatterStats(stats: BatterStats[]): BatterStats {
  return stats.reduce((total, current) => {
    (Object.keys(total) as Array<keyof BatterStats>).forEach((key) => { total[key] += current[key] ?? 0; });
    return total;
  }, emptyBatterStats());
}
