import { opponentOf, userFixtures } from "../engine/gameEngine";
import { postseasonStageLabel } from "../engine/postseason";
import type { SeasonState } from "../engine/types";

export function ScheduleView({ state }: { state: SeasonState }) {
  const fixtures = userFixtures(state.schedule, state.config.userTeam);
  const start = Math.max(0, state.currentDay - 5);
  const end = Math.min(fixtures.length, state.currentDay + 16);
  return (
    <section className="card schedule-view">
      <header className="section-header"><div><span className="eyebrow">{state.season} · 144 GAME SCHEDULE</span><h2>삼성 일정</h2></div><small>상대별 16경기 · 홈/원정 8:8</small></header>
      <div className="schedule-list">
        {fixtures.slice(start, end).map((fixture, offset) => {
          const index = start + offset;
          const opponent = opponentOf(fixture, state.config.userTeam);
          const current = index === state.currentDay;
          return <div className={`schedule-row ${current ? "current" : ""} ${index < state.currentDay ? "played" : ""}`} key={fixture.id}><span>{index + 1}</span><div><small>{fixture.seriesLength}연전 · {fixture.gameInSeries}차전</small><strong>{fixture.home === state.config.userTeam ? "vs" : "@"} {state.leagueData.teams[opponent].name}</strong></div><em>{index < state.currentDay ? "완료" : current ? "진행 중" : `${index + 1}차전`}</em></div>;
        })}
      </div>
      {state.postseason && <><header className="section-header"><div><span className="eyebrow">POSTSEASON</span><h2>포스트시즌 결과</h2></div><small>{state.postseason.champion ? `우승 · ${state.leagueData.teams[state.postseason.champion].name}` : "진행 중"}</small></header><div className="schedule-list">{state.postseason.games.map((record, index) => { const { summary } = record; return <div className="schedule-row played" key={`${record.stage}-${index}`}><span>{record.gameNumber}</span><div><small>{postseasonStageLabel[record.stage]}</small><strong>{state.leagueData.teams[summary.away].shortName} {summary.awayScore}–{summary.homeScore} {state.leagueData.teams[summary.home].shortName}</strong></div><em>완료</em></div>; })}</div></>}
    </section>
  );
}
