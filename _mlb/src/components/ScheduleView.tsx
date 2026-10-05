import { useState } from "react";
import { opponentOf, userFixtures } from "../engine/gameEngine";
import { scoreForTeam, teamResult } from "../engine/milestones";
import { postseasonStageLabel } from "../engine/postseason";
import type { GameSummary, SeasonState } from "../engine/types";

export function ScheduleView({ state }: { state: SeasonState }) {
  const fixtures = userFixtures(state.schedule, state.config.userTeam);
  const results = new Map((state.regularResults ?? []).map(result => [result.fixtureId, result.summary]));
  // An older save may have only its latest completed game available.
  if (state.game?.finalized && state.game.competition === "REGULAR_SEASON" && state.game.summary) results.set(state.game.fixture.id, state.game.summary);
  const [all, setAll] = useState(false);
  const start = all ? 0 : Math.max(0, state.teamRecords[state.config.userTeam].games - 5);
  const resultLabel = (summary: GameSummary) => summary.away === state.config.userTeam || summary.home === state.config.userTeam
    ? teamResult(summary, state.config.userTeam)
    : summary.awayScore === summary.homeScore ? "무" : `${state.leagueData.teams[summary.awayScore > summary.homeScore ? summary.away : summary.home].shortName} 승`;
  return <section className="card schedule-view">
    <header className="section-header"><div><span className="eyebrow">{state.season} · 162 GAME SCHEDULE</span><h2>{state.leagueData.teams[state.config.userTeam].name} 일정</h2></div><button className="ghost-button" onClick={() => setAll(!all)}>{all ? "최근/예정만" : "전체 일정"}</button></header>
    <p className="data-note">2026 MLB 대진 횟수 기반 가상 일정 · 홈 81 / 원정 81 · 지구 52 / 같은 리그 타 지구 62 / 인터리그 48경기. 새 시즌은 개막·최종 구간을 포함해 연전 묶음을 무작위 재배치합니다. 실제 요일·이동 휴식 배치는 달라지며 이전 세이브의 일정은 유지합니다.</p>
    <div className="schedule-list">{fixtures.slice(start, all ? undefined : start + 22).map((fixture, offset) => {
      const index = start + offset;
      const summary = results.get(fixture.id);
      const current = fixture.id === state.game?.fixture.id;
      const previouslyPlayed = index < state.teamRecords[state.config.userTeam].games;
      return <div className={`schedule-row ${current ? "current" : ""} ${summary || previouslyPlayed ? "played" : ""}`} key={fixture.id}>
        <span>{index + 1}</span><div><small>{fixture.date} · {fixture.gameInSeries}/{fixture.seriesLength}차전</small><strong>{fixture.home === state.config.userTeam ? "vs" : "@"} {state.leagueData.teams[opponentOf(fixture, state.config.userTeam)].name}</strong></div>
        <em>{summary ? `${teamResult(summary, state.config.userTeam)} · ${scoreForTeam(summary, state.config.userTeam)}` : previouslyPlayed ? "완료 · 이전 기록 없음" : current ? "진행 중" : "예정"}</em>
      </div>;
    })}</div>
    {state.postseason && <><h2 className="league-heading">포스트시즌 결과</h2><div className="schedule-list">{state.postseason.games.map((record, index) => {
      const summary = record.summary;
      return <div className="schedule-row played" key={index}><span>{record.gameNumber}</span><div><small>{postseasonStageLabel[record.stage]}</small><strong>{state.leagueData.teams[summary.away].shortName} {summary.awayScore}–{summary.homeScore} {state.leagueData.teams[summary.home].shortName}</strong></div><em>{resultLabel(summary)}</em></div>;
    })}</div></>}
  </section>;
}
