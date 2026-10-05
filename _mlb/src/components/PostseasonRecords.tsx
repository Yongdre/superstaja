import { postseasonBattingBySeries, postseasonStageLabel } from "../engine/postseason";
import type { SeasonState } from "../engine/types";
import { BattingRecordTable } from "./BattingRecordTable";
import { SeasonStatGrid } from "./StatLine";

export function PostseasonRecords({ state }: { state: SeasonState }) {
  const series = postseasonBattingBySeries(state);
  const archived = state.career.seasons.filter((season) => season.season !== state.season && season.postseason?.qualified);
  if (!state.postseason && !archived.length) return null;
  return <section className="card full-width table-card">
    <header className="section-header"><div><span className="eyebrow">POSTSEASON BY SERIES</span><h2>시리즈별 포스트시즌 기록</h2></div><small>정규시즌 통산 기록과 별도 집계</small></header>
    {series.length ? <BattingRecordTable rows={series.map((row) => ({
      id: row.stage, label: `${state.season} ${postseasonStageLabel[row.stage]}`, games: row.games,
      stats: row.complete ? row.playerStats : undefined,
      note: row.complete ? (state.game?.competition === row.stage && !state.game.finalized ? "현재 경기 포함" : "") : "이전 세이브에 경기별 기록 없음",
    }))} /> : <p className="data-note">이번 시즌에 출전한 포스트시즌 경기가 없습니다.</p>}
    {[...archived].reverse().map((season) => <details className="postseason-history" key={season.season}>
      <summary>{season.season} 포스트시즌 기록</summary>
      <SeasonStatGrid stats={season.postseason!.playerStats} />
      {season.postseason!.seriesStats?.length ? <BattingRecordTable rows={season.postseason!.seriesStats.map((row) => ({
        id: row.stage, label: postseasonStageLabel[row.stage], games: row.games,
        stats: row.complete ? row.playerStats : undefined, note: row.complete ? "" : "이전 세이브에 경기별 기록 없음",
      }))} /> : <p className="data-note">이전 세이브에는 포스트시즌 합계만 저장되어 있어 시리즈별 기록을 복원할 수 없습니다.</p>}
    </details>)}
  </section>;
}
