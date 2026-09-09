import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createExampleSave } from "../../engine/gameEngine";
import { BatterPanel } from "../BatterPanel";

describe("상대 투수 등급", () => {
  it("기존 JSON의 능력치로 등급만 표시하고 방어율이나 세부 능력치는 표시하지 않는다", () => {
    const state = createExampleSave();
    const pitcher = state.leagueData.teams.DOO.pitchers.find((p) => p.id === state.game!.pitchers.DOO.pitcherId)!;
    delete pitcher.grade;
    pitcher.stuff = pitcher.movement = pitcher.control = 72;
    const html = renderToStaticMarkup(<BatterPanel state={state} onChoice={() => {}} onSteal={() => {}} />);
    expect(html).toContain('aria-label="투수 등급 B"');
    expect(html).toContain("B등급");
    expect(html).not.toMatch(/방어율|ERA|구위|무브먼트|제구/);
  });

  it("상대 투수가 교체되면 해당 선수의 JSON 등급을 표시한다", () => {
    const state = createExampleSave();
    const pitcher = state.leagueData.teams.DOO.pitchers[1];
    pitcher.grade = "S";
    state.game!.pitchers.DOO.pitcherId = pitcher.id;
    state.game!.pitchers.DOO.name = pitcher.name;
    const html = renderToStaticMarkup(<BatterPanel state={state} onChoice={() => {}} onSteal={() => {}} />);
    expect(html).toContain(pitcher.name);
    expect(html).toContain('aria-label="투수 등급 S"');
  });
});

describe("도루 안내", () => {
  it("입력한 최종 성공률과 보정 없는 독립 판정을 안내한다", () => {
    const state = createExampleSave();
    state.config.stealSuccess = 0.75;
    state.game!.phase = "WAITING_FOR_STEAL";
    const html = renderToStaticMarkup(<BatterPanel state={state} onChoice={() => {}} onSteal={() => {}} />);
    expect(html).toContain("성공률 75%");
    expect(html).toContain("투수·포수·주루 능력 보정 없이 매 시도 독립 판정");
    expect(html).not.toContain("기본 성공률");
    expect(html).not.toContain("보정됩니다");
  });
});
