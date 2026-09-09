import { careerSeasonsIncludingCurrent, careerStats } from "../engine/career";
import { getHeadToHead } from "../engine/gameEngine";
import { userFieldPositionLabels } from "../engine/types";
import type { SeasonState, TeamId } from "../engine/types";
import { SeasonStatGrid } from "./StatLine";
import { BattingRecordTable } from "./BattingRecordTable";
import { PostseasonRecords } from "./PostseasonRecords";

export function RecordsView({ state }: { state: SeasonState }) {
  const team = state.teamRecords[state.config.userTeam];
  const totals = careerStats(state);
  const seasons = careerSeasonsIncludingCurrent(state);
  return (
    <div className="records-layout">
      <section className="card record-hero"><span className="eyebrow">{state.season} PLAYER RECORD</span><h2>{state.config.playerName}</h2><p>{state.season} 가상 시즌 · {state.leagueData.teams[state.config.userTeam].name} {userFieldPositionLabels[state.config.position]}</p><SeasonStatGrid stats={state.playerStats["USER-PLAYER"]} /></section>
      {state.postseason && <section className="card record-hero"><span className="eyebrow">POSTSEASON RECORD</span><h2>포스트시즌</h2><p>정규시즌과 별도로 집계되는 기록</p><SeasonStatGrid stats={state.postseason.playerStats["USER-PLAYER"]} /></section>}
      <section className="card"><header className="section-header"><div><span className="eyebrow">TEAM SPLITS</span><h2>{state.leagueData.teams[state.config.userTeam].shortName} 팀 기록</h2></div></header><div className="big-record"><strong>{team.wins}<small>승</small></strong><strong>{team.losses}<small>패</small></strong><strong>{team.ties}<small>무</small></strong></div><div className="split-grid"><div><span>홈 경기</span><strong>{team.homeGames}</strong></div><div><span>원정 경기</span><strong>{team.awayGames}</strong></div><div><span>득점</span><strong>{team.runsFor}</strong></div><div><span>실점</span><strong>{team.runsAgainst}</strong></div></div></section>
      <section className="card full-width career-record"><header className="section-header"><div><span className="eyebrow">CAREER TOTAL</span><h2>통산 기록</h2></div><small>{state.career.debutYear}–{state.season} · {seasons.length}시즌</small></header><SeasonStatGrid stats={totals} /></section>
      <section className="card full-width table-card"><header className="section-header"><div><span className="eyebrow">SEASON BY SEASON</span><h2>연도별 기록</h2></div><small>현재 시즌 포함</small></header>
        <p className="data-note">볼넷 합계는 일반 볼넷·고의사구·몸에 맞는 공을 포함합니다. 괄호는 고의사구, 사구 순서입니다. 루타는 안타로 얻은 베이스 수입니다.</p>
        <BattingRecordTable rows={[...seasons].reverse().map((season) => ({
          id: String(season.season), label: String(season.season), games: season.teamRecord.games, stats: season.playerStats,
          current: season.season === state.season,
          note: `${season.teamRecord.wins}승 ${season.teamRecord.losses}패 ${season.teamRecord.ties}무${season.season === state.season && state.progress === "REGULAR_SEASON" ? " · 진행 중" : ""}`,
        }))} />
      </section>
      <PostseasonRecords state={state} />
      <section className="card full-width"><header className="section-header"><div><span className="eyebrow">HEAD TO HEAD</span><h2>상대 전적</h2></div></header><div className="opponent-grid">{(Object.keys(state.leagueData.teams) as TeamId[]).filter((id) => id !== state.config.userTeam).map((id) => { const record = getHeadToHead(state, state.config.userTeam, id); return <div key={id}><i style={{ background: state.leagueData.teams[id].primary }} /><span>{state.leagueData.teams[id].shortName}</span><strong>{record.wins}승 {record.losses}패 {record.ties}무</strong></div>; })}</div></section>
    </div>
  );
}
