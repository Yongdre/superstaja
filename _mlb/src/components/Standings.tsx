import { formatTeamStreak } from "../engine/milestones";
import { divisions, leagues, mlbTeams } from "../data/mlbStructure";
import { createPostseason, rankMlbTeams } from "../engine/postseason";
import { winningPct } from "../engine/standings";
import type { SeasonState } from "../engine/types";

export function Standings({ state }: { state: SeasonState; compact?: boolean }) {
  const seeds = (state.postseason ?? createPostseason(state.teamRecords, {}, state.headToHead, state.regularResults)).leagueSeeds;
  return <div className="mlb-standings">{leagues.map(league => <section key={league}><h2 className="league-heading">{league === "AL" ? "아메리칸리그" : "내셔널리그"}</h2>{divisions.map(division => {
    const teams = rankMlbTeams(mlbTeams.filter(team => team.league === league && team.division === division).map(team => team.id), state.teamRecords, state.headToHead, state.regularResults);
    const leader = state.teamRecords[teams[0]];
    return <section className="card table-card team-standings" key={division}><header className="section-header"><h3>{league} {division}</h3><small>지구 1위 + 리그 와일드카드 3팀</small></header><div className="table-wrap"><table><thead><tr><th>순위</th><th className="align-left">팀</th><th>승</th><th>패</th><th>승률</th><th>게임차</th><th>연속</th><th>PS</th></tr></thead><tbody>{teams.map((id,index) => {
      const record = state.teamRecords[id], seed = seeds[league].indexOf(id);
      return <tr className={id === state.config.userTeam ? "user-row" : ""} key={id}><td>{index+1}</td><td className="align-left">{state.leagueData.teams[id].shortName}</td><td>{record.wins}</td><td>{record.losses}</td><td>{winningPct(record).toFixed(3).replace(/^0/,"")}</td><td>{index ? ((leader.wins-record.wins+record.losses-leader.losses)/2).toFixed(1) : "–"}</td><td>{formatTeamStreak(record.streak)}</td><td>{seed < 0 ? "–" : `${seed<3 ? "지구" : "WC"} #${seed+1}`}</td></tr>;
    })}</tbody></table></div></section>;
  })}</section>)}</div>;
}
