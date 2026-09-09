import { avg, combinedWalks, formatRate, formatWalks, obp, ops, slg, totalBases, walksLabel } from "../engine/statistics";
import type { BatterStats } from "../engine/types";

export function TodayLine({ stats }: { stats: BatterStats }) {
  const extras = [stats.hr ? `홈런 ${stats.hr}` : "", stats.doubles ? `2루타 ${stats.doubles}` : "", stats.triples ? `3루타 ${stats.triples}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="today-line">
      <strong>{stats.ab}타수 {stats.h}안타{extras ? ` (${extras})` : ""}</strong>
      <span>{stats.rbi}타점 · {stats.runs}득점{combinedWalks(stats) > 0 ? ` · 볼넷 ${formatWalks(stats)}` : ""}{stats.sf ? ` · 희생플라이 ${stats.sf}` : ""}{stats.sh ? ` · 희생번트 ${stats.sh}` : ""}</span>
    </div>
  );
}

export function SeasonStatGrid({ stats }: { stats: BatterStats }) {
  const entries = [
    ["타수", stats.ab], ["안타", stats.h], ["2루타", stats.doubles], ["3루타", stats.triples],
    ["홈런", stats.hr], ["루타", totalBases(stats)], ["타점", stats.rbi], ["득점", stats.runs], [walksLabel, formatWalks(stats)],
    ["희생플라이", stats.sf], ["희생번트", stats.sh ?? 0], ["도루", `${stats.sb}-${stats.cs}`], ["타율", formatRate(avg(stats))], ["출루율", formatRate(obp(stats))],
    ["장타율", formatRate(slg(stats))], ["OPS", formatRate(ops(stats))],
  ];
  return (
    <div className="stat-grid">
      {entries.map(([label, value]) => <div className={`stat-cell${label === walksLabel ? " stat-cell-wide" : ""}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
  );
}
