import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNewSeason } from "../../engine/gameEngine";
import { emptyBatterStats } from "../../engine/statistics";
import { BatterPanel } from "../BatterPanel";
import { GameEnd } from "../GameEnd";
import { ScheduleView } from "../ScheduleView";
import { UserStreaks } from "../UserStreaks";
import { CYCLE_DISPLAY_MS } from "../CycleCelebration";

it("NO HIT 제한 경고와 정확히 한 개의 활성 결과 버튼을 표시한다", () => {
  const state = createNewSeason({ targetAvgMax: .3 });
  state.teamRecords[state.config.userTeam].games = 100;
  state.playerStats["USER-PLAYER"] = {...emptyBatterStats(), h: 380, ab: 1000, pa: 1000};
  const html = renderToStaticMarkup(<BatterPanel state={state} onChoice={() => {}} onSteal={() => {}} />);
  expect(html).toContain("목표 타율에 크게 벗어납니다");
  expect(html).toContain("강제 NO HIT 10타석 남음");
  expect(html.match(/disabled=""/g)).toHaveLength(9);
});

it("다음 시즌 포지션 선택에 지명타자를 포함한다", () => {
  const state = createNewSeason({position: "DH"});
  state.game!.phase = "SEASON_END";
  state.game!.summary = {away: state.game!.fixture.away, home: state.game!.fixture.home, awayScore: 1, homeScore: 0, winningPitcher: "", losingPitcher: ""};
  const html = renderToStaticMarkup(<GameEnd state={state} onNext={() => {}} onNavigate={() => {}} />);
  expect(html).toContain('value="DH" selected="">지명타자');
  expect(html).toContain("새 시즌 포지션과 목표");
});

it("일정은 사용자 기준 점수와 승패를 표시한다", () => {
  const state = createNewSeason();
  const fixture = state.game!.fixture, userHome = fixture.home === state.config.userTeam;
  const summary = {away: fixture.away, home: fixture.home, awayScore: userHome ? 2 : 5, homeScore: userHome ? 5 : 2, winningPitcher: "", losingPitcher: ""};
  state.regularResults = [{fixtureId: fixture.id, date: "", summary}];
  const html = renderToStaticMarkup(<ScheduleView state={state}/>);
  expect(html).toContain("승 · 5–2");
});

it("안타/출루 10경기와 홈런 2경기부터만 표시한다", () => {
  const state = createNewSeason();
  state.userGameHistory = Array.from({length: 9}, (_, i) => ({fixtureId: "past-" + i, competition: "REGULAR_SEASON" as const, stats: {...emptyBatterStats(), h: 1, hr: i >= 7 ? 1 : 0}}));
  state.game!.userGameStats = emptyBatterStats();
  let html = renderToStaticMarkup(<UserStreaks state={state} />);
  expect(html).not.toContain("연속안타");
  expect(html).not.toContain("연속출루");
  expect(html).toContain("2경기 연속홈런 중입니다.");
  state.game!.userGameStats = {...emptyBatterStats(),h: 1};
  html = renderToStaticMarkup(<UserStreaks state={state} />);
  expect(html).toContain("10경기 연속안타 중입니다.");
  expect(html).toContain("10경기 연속출루 중입니다.");
  expect(CYCLE_DISPLAY_MS).toBe(2000);
});
