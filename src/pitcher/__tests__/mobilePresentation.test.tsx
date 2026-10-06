import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultPitcherDataset } from "../data";
import { createPitcherCareer, emptyPitchingStats, pitcherKey, USER_PITCHER_ID } from "../engine";
import { pitcherRankings, pitcherRankingCategories } from "../leaderboard";
import { PitcherRankingSummary, PitcherRankingTable } from "../PitcherRankings";

function rankedCareer() {
  const dataset = defaultPitcherDataset("KBO");
  const state = createPitcherCareer({ league: "KBO", dataId: dataset.id, playerName: "순위 에이스", teamId: "SAM", throws: "R", debutYear: 2026, rotationSlot: 1, targetEra: 2.8, seed: 731 }, dataset);
  state.leaguePitching = {};
  const opponents = dataset.teams.KIA.pitchers.filter((pitcher) => pitcher.role === "SP");
  for (const [teamId, id, runs, strikeouts] of [["KIA", opponents[0].id, 0, 7], ["SAM", USER_PITCHER_ID, 3, 9], ["KIA", opponents[1].id, 9, 11]] as const) {
    state.leaguePitching[pitcherKey(teamId, id)] = { ...emptyPitchingStats(), games: 1, starts: 1, outs: 27, earnedRuns: runs, runs, strikeouts, qualityStarts: 1, qualityStartsPlus: 1 };
  }
  return state;
}

describe("투수 순위의 모바일 표시", () => {
  it.each(pitcherRankingCategories)("$label을 선택하면 그 기록 열만 표시한다", ({ value, label }) => {
    const state = rankedCareer();
    const html = renderToStaticMarkup(<PitcherRankingTable state={state} rows={pitcherRankings(state, value)} category={value} />);
    const headings = [...html.match(/<thead>(.*?)<\/thead>/)![1].matchAll(/<th>(.*?)<\/th>/g)].map((match) => match[1]);
    expect(headings).toEqual(["순위", "선수", "팀", label]);
    expect(html).not.toContain("이닝 / 규정");
  });
  it("맨 위 요약에 선택한 항목의 내 순위와 기록을 표시한다", () => {
    const state = rankedCareer();
    const html = renderToStaticMarkup(<PitcherRankingSummary state={state} rows={pitcherRankings(state, "era")} category="era" qualifiedOnly />);
    expect(html).toContain("2위");
    expect(html).toContain("순위 에이스");
    expect(html).toContain("3.00");
    expect(html).toContain("3명 중");
  });
  it("공동 순위와 규정이닝 미달을 실제 필터 기준으로 구분한다", () => {
    const state = rankedCareer();
    state.leaguePitching[pitcherKey("SAM", USER_PITCHER_ID)].earnedRuns = 0;
    const tied = renderToStaticMarkup(<PitcherRankingSummary state={state} rows={pitcherRankings(state, "era")} category="era" qualifiedOnly />);
    expect(tied).toContain("공동 1위");
    state.records.SAM.games = 10;
    const excluded = renderToStaticMarkup(<PitcherRankingSummary state={state} rows={pitcherRankings(state, "era")} category="era" qualifiedOnly />);
    expect(excluded).toContain("규정이닝 미달");
    expect(excluded).toContain("전체 공동 1위");
    const all = renderToStaticMarkup(<PitcherRankingSummary state={state} rows={pitcherRankings(state, "era", false)} category="era" qualifiedOnly={false} />);
    expect(all).toContain("공동 1위");
  });
  it("아직 종료된 등판이 없으면 등수를 만들어 표시하지 않는다", () => {
    const state = rankedCareer();
    delete state.leaguePitching[pitcherKey("SAM", USER_PITCHER_ID)];
    const html = renderToStaticMarkup(<PitcherRankingSummary state={state} rows={pitcherRankings(state, "strikeouts")} category="strikeouts" qualifiedOnly />);
    expect(html).toContain("집계 대기");
    expect(html).not.toMatch(/\d위/);
  });
});
