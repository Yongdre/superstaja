import { useState } from "react";
import { pitcherRankings, pitcherRankingCategories, pitcherRankingValueLabel } from "./leaderboard";
import type { PitcherRankingCategory, PitcherRankingRow } from "./leaderboard";
import type { PitcherState } from "./types";

export function PitcherRankingTable({ state, rows, category }: { state: PitcherState; rows: PitcherRankingRow[]; category: PitcherRankingCategory }) {
  const label = pitcherRankingCategories.find((item) => item.value === category)!.label;
  return <div className="bp-table-scroll"><table className="bp-data-table bp-ranking-table"><thead><tr><th>순위</th><th>선수</th><th>팀</th><th>{label}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} className={row.user ? "bp-highlight-row" : ""}><td>{row.rank ?? "—"}</td><th>{row.name}{row.user && <span className="bp-my-team">MY</span>}</th><td>{state.dataset.teams[row.teamId].shortName}</td><td>{pitcherRankingValueLabel(row.stats, category)}</td></tr>)}</tbody></table></div>;
}

export function PitcherRankingSummary({ state, rows, category, qualifiedOnly }: { state: PitcherState; rows: PitcherRankingRow[]; category: PitcherRankingCategory; qualifiedOnly: boolean }) {
  const label = pitcherRankingCategories.find((item) => item.value === category)!.label;
  const allRows = pitcherRankings(state, category, false);
  const myRow = rows.find((row) => row.user);
  const ownRecord = myRow ?? allRows.find((row) => row.user);
  const excluded = ownRecord && !myRow && qualifiedOnly && (category === "era" || category === "kPerNine");
  const comparison = excluded ? allRows : rows;
  const shownRank = myRow?.rank ?? (excluded ? ownRecord?.rank : null);
  const tied = shownRank != null && comparison.some((row) => !row.user && row.rank === shownRank);
  const rankLabel = shownRank != null ? `${excluded ? "전체 " : ""}${tied ? "공동 " : ""}${shownRank}위` : excluded ? "규정이닝 미달" : "집계 대기";
  return <div className="bp-my-ranking" aria-label="내 선수 순위"><div><span className="bp-eyebrow">MY RANK · {label}</span><strong>{rankLabel}</strong><p>{state.config.playerName} · {state.dataset.teams[state.config.teamId].shortName}{shownRank != null ? ` · ${comparison.filter((row) => row.rank !== null).length}명 중` : ""}</p></div><div><span>{label}</span><b>{ownRecord ? pitcherRankingValueLabel(ownRecord.stats, category) : "—"}</b></div>{myRow?.rank == null && <small>{excluded ? "규정이닝 미달 · 내 순위는 전체 선수 기준입니다. 필터를 해제하면 내 선수를 표에서도 볼 수 있습니다." : "등판 기록은 경기 종료 후 순위에 반영됩니다."}</small>}</div>;
}

export function PitcherRankingsPage({ state }: { state: PitcherState }) {
  const [category, setCategory] = useState<PitcherRankingCategory>("era");
  const [qualifiedOnly, setQualifiedOnly] = useState(true);
  const rows = pitcherRankings(state, category, qualifiedOnly);
  const rateCategory = category === "era" || category === "kPerNine";
  const legacy = Object.values(state.leaguePitchingSinceGames).some((games) => games > 0);
  return <section className="bp-card bp-full-card"><div className="bp-section-title bp-page-title"><div><span className="bp-eyebrow">PITCHER LEADERBOARD</span><h2>투수 순위</h2><p>{state.config.league} · {state.year} · 선발투수</p></div></div><PitcherRankingSummary state={state} rows={rows} category={category} qualifiedOnly={qualifiedOnly} /><div className="bp-ranking-filters"><label>순위 기준<select value={category} onChange={(event) => setCategory(event.target.value as PitcherRankingCategory)}>{pitcherRankingCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{rateCategory && <label className="bp-checkbox"><input type="checkbox" checked={qualifiedOnly} onChange={(event) => setQualifiedOnly(event.target.checked)} />규정이닝 충족 선수만</label>}</div><PitcherRankingTable state={state} rows={rows} category={category} />{rows.length === 0 && <p className="bp-ranking-empty">{rateCategory && qualifiedOnly ? "아직 규정이닝을 채운 선발투수가 없습니다. 규정이닝 필터를 해제하거나 경기를 진행해 주세요." : "경기를 마치면 선발투수들의 기록과 순위가 표시됩니다."}</p>}<p className="bp-note">종료된 경기의 실제 투구 기록으로 집계합니다. 방어율은 낮은 순, 나머지는 높은 순이며 같은 기록은 공동 순위입니다. 규정이닝은 집계 기간의 소속 팀 경기 수 × 1이닝입니다.</p>{legacy && <p className="bp-note">기존 세이브의 리그 투수 순위는 업데이트 이후 완료된 경기부터 집계합니다. 내 기존 기록은 투구 기록 메뉴에서 그대로 확인할 수 있습니다.</p>}</section>;
}
