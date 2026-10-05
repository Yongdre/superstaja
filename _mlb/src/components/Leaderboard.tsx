import { useMemo, useState } from "react";
import { avg, combinedWalks, formatRate, isQualified, obp, ops, slg, totalBases } from "../engine/statistics";
import type { BatterStats, SeasonState, TeamId } from "../engine/types";

type Category = "AVG" | "H" | "2B" | "3B" | "HR" | "TB" | "RBI" | "R" | "BB" | "SB" | "OBP" | "SLG" | "OPS";

const categories: Category[] = ["AVG", "H", "2B", "3B", "HR", "TB", "RBI", "R", "BB", "SB", "OBP", "SLG", "OPS"];
const categoryLabel = (category: Category) => category === "BB" ? "볼넷" : category === "TB" ? "루타" : category;
const rateCategories = new Set<Category>(["AVG", "OBP", "SLG", "OPS"]);

function teamAndName(id: string, state: SeasonState): { team: TeamId; name: string } | null {
  if (id === "USER-PLAYER") return { team: state.config.userTeam, name: state.config.playerName };
  for (const team of Object.values(state.leagueData.teams)) {
    const player = team.hitters.find((hitter) => hitter.id === id);
    if (player) return { team: team.id, name: player.name };
  }
  return null;
}

const valueOf = (stats: BatterStats, category: Category) => {
  switch (category) {
    case "AVG": return avg(stats); case "H": return stats.h; case "2B": return stats.doubles; case "3B": return stats.triples;
    case "HR": return stats.hr; case "TB": return totalBases(stats); case "RBI": return stats.rbi; case "R": return stats.runs; case "BB": return combinedWalks(stats);
    case "SB": return stats.sb; case "OBP": return obp(stats); case "SLG": return slg(stats); case "OPS": return ops(stats);
  }
};

export function Leaderboard({ state }: { state: SeasonState }) {
  const [category, setCategory] = useState<Category>("HR");
  const ranking = useMemo(() => Object.entries(state.playerStats).map(([id, stats]) => {
    const info = teamAndName(id, state);
    return info ? { id, stats, ...info, value: valueOf(stats, category) } : null;
  }).filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => !rateCategories.has(category) || isQualified(row.stats, state.teamRecords[row.team].games))
    .sort((a, b) => b.value - a.value || b.stats.pa - a.stats.pa), [state, category]);
  const userRank = ranking.findIndex((row) => row.id === "USER-PLAYER") + 1;

  return (
    <section className="card leaderboard">
      <header className="section-header"><div><span className="eyebrow">PLAYER LEADERS</span><h2>개인 순위</h2></div>{rateCategories.has(category) && <small>규정타석: 팀 경기 × 3.1</small>}</header>
      <div className="category-tabs">{categories.map((item) => <button className={item === category ? "active" : ""} onClick={() => setCategory(item)} key={item}>{categoryLabel(item)}</button>)}</div>
      {category === "BB" && <p className="data-note">일반 볼넷·고의사구·사구를 합산한 순위입니다.</p>}
      <div className="leader-summary"><div><span>{categoryLabel(category)} 부문</span><strong>{userRank ? `리그 ${userRank}위` : "규정타석 미달"}</strong></div><div><span>{state.config.playerName}</span><strong>{rateCategories.has(category) ? formatRate(valueOf(state.playerStats["USER-PLAYER"], category)) : valueOf(state.playerStats["USER-PLAYER"], category)}</strong></div></div>
      <div className="ranking-list">
        {ranking.slice(0, 15).map((row, index) => <div className={row.id === "USER-PLAYER" ? "ranking-row user" : "ranking-row"} key={row.id}><b>{index + 1}</b><i style={{ background: state.leagueData.teams[row.team].primary }} /><div><strong>{row.name}</strong><span>{state.leagueData.teams[row.team].shortName} · {row.stats.pa} PA</span></div><em>{rateCategories.has(category) ? formatRate(row.value) : row.value}</em></div>)}
      </div>
    </section>
  );
}
