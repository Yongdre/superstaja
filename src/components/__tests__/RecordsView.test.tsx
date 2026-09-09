import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createExampleSave } from "../../engine/gameEngine";
import { createPostseason } from "../../engine/postseason";
import { emptyBatterStats } from "../../engine/statistics";
import { RecordsView } from "../RecordsView";

describe("기록 화면", () => {
  it("이전 시즌과 현재 시즌의 루타를 통산에 합산하고 연도별 표에도 보존한다", () => {
    const state = createExampleSave();
    const previous = { ...emptyBatterStats(), ab: 100, h: 30, doubles: 8, triples: 2, hr: 5 };
    state.playerStats["USER-PLAYER"] = { ...previous };
    state.career.seasons.push({ season: 2016, teamId: "SAM", playerStats: previous, teamRecord: state.teamRecords.SAM, goals: state.config });
    const html = renderToStaticMarkup(<RecordsView state={state} />);
    expect(html).toContain("<span>루타</span><strong>114</strong>");
    expect(html.match(/>57</g)).toHaveLength(3);
    expect(html).toContain("<th>홈런</th><th>루타</th>");
    expect(html).toContain("표를 좌우로 밀어 루타·볼넷 등 전체 기록을 확인하세요.");
  });

  it("시즌·통산·연도별 기록에 통합 볼넷과 루타를 표시한다", () => {
    const state = createExampleSave();
    state.playerStats["USER-PLAYER"] = { ...emptyBatterStats(), ab: 100, h: 30, doubles: 8, triples: 2, hr: 5, bb: 40, ibb: 3, hbp: 5 };
    const html = renderToStaticMarkup(<RecordsView state={state} />);
    expect(html.match(/볼넷\(고의사구, 사구\)/g)).toHaveLength(3);
    expect(html.match(/45 \(3, 5\)/g)).toHaveLength(3);
    expect(html.match(/>57</g)).toHaveLength(3);
    expect(html).not.toContain(">4구<");
  });

  it("시리즈 기록 누락과 실제 0을 구분하고 이전 연도의 상세 기록을 제공한다", () => {
    const state = createExampleSave();
    state.postseason = createPostseason(state.teamRecords, structuredClone(state.playerStats));
    state.postseason.games.push({ stage: "PLAYOFF", gameNumber: 1, summary: { away: "SAM", home: "DOO", awayScore: 2, homeScore: 3, winningPitcher: "승", losingPitcher: "패" } });
    state.career.seasons.push({ season: 2016, teamId: "SAM", playerStats: emptyBatterStats(), teamRecord: state.teamRecords.SAM, goals: state.config, postseason: {
      qualified: true, champion: "SAM", playerStats: { ...emptyBatterStats(), hr: 2, h: 3, ab: 10 },
      seriesStats: [{ stage: "KOREAN_SERIES", games: 4, playerStats: { ...emptyBatterStats(), h: 3, hr: 2, ab: 10 }, complete: true }],
    } });
    const html = renderToStaticMarkup(<RecordsView state={state} />);
    expect(html).toContain("2017 플레이오프");
    expect(html).toContain("이전 세이브에 경기별 기록 없음");
    expect(html).toContain("2016 포스트시즌 기록");
    expect(html).toContain("한국시리즈");
  });
});
