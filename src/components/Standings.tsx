import { calculateStandings } from "../engine/standings";
import type { SeasonState } from "../engine/types";

export function Standings({ state, compact = false }: { state: SeasonState; compact?: boolean }) {
  const rows = calculateStandings(state.teamRecords);
  const shown = compact ? rows.slice(0, 5) : rows;
  return (
    <section className="card table-card">
      <header className="section-header"><div><span className="eyebrow">LEAGUE TABLE</span><h2>{state.season} KBO 순위</h2></div><small>{state.teamRecords[state.config.userTeam].games}경기 진행</small></header>
      <div className="table-wrap"><table>
        <thead><tr><th>순위</th><th className="align-left">팀</th><th>경기</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>게임차</th></tr></thead>
        <tbody>{shown.map((row, index) => <tr className={row.teamId === state.config.userTeam ? "user-row" : ""} key={row.teamId}><td><b>{index + 1}</b></td><td className="align-left team-cell"><i style={{ background: state.leagueData.teams[row.teamId].primary }} />{state.leagueData.teams[row.teamId].name}</td><td>{row.record.games}</td><td>{row.record.wins}</td><td>{row.record.losses}</td><td>{row.record.ties}</td><td>{row.pct.toFixed(3).replace(/^0/, "")}</td><td>{index === 0 ? "–" : row.gamesBack.toFixed(1)}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}
