import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createExampleSave } from "../../engine/gameEngine";
import { GameEnd } from "../GameEnd";

it("다음 시즌 설정에 현재 도루 성공률을 기본값으로 표시한다", () => {
  const state = createExampleSave();
  state.config.stealSuccess = 0.83;
  state.game!.phase = "SEASON_END";
  state.game!.summary = { away: "DOO", home: "SAM", awayScore: 0, homeScore: 1, winningPitcher: "승", losingPitcher: "패" };
  const html = renderToStaticMarkup(<GameEnd state={state} onNext={() => {}} onNavigate={() => {}} />);
  expect(html).toContain("도루 성공률 (%)");
  expect(html).toContain('min="25" max="95" step="1" value="83"');
});
