import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Navigation } from "../Navigation";

describe("반응형 메뉴", () => {
  it("모바일에서도 저장/불러오기를 포함한 여섯 메뉴와 선택 상태를 표시한다", () => {
    const html = renderToStaticMarkup(<Navigation tab="save" onNavigate={() => {}} mobile />);
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html).toContain('class="mobile-nav"');
    expect(html).toContain('aria-label="저장 / 불러오기" aria-current="page"');
    expect(html).toContain("저장 /\n불러오기");
    for (const label of ["경기", "일정", "순위", "리그 기록", "선수 기록"]) expect(html).toContain(`aria-label="${label}"`);
  });

  it("데스크톱의 전체 메뉴와 타석 대기 표시를 유지한다", () => {
    const html = renderToStaticMarkup(<Navigation tab="game" onNavigate={() => {}} awaitingAtBat />);
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html).toContain("<b></b>");
    expect(html).not.toContain('class="mobile-nav"');
  });
});
