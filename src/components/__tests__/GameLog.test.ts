import { describe, expect, it } from "vitest";
import { gameLogEntryClasses, needsCurrentInningMarker } from "../GameLog";
import type { GameLogEntry } from "../../engine/types";

const entry = (text: string): GameLogEntry => ({ id: 1, inning: 1, half: "TOP", text, important: true });

describe("문자중계 표시", () => {
  it("새 이닝의 첫 플레이 전에는 현재 이닝 표식을 보여준다", () => {
    expect(needsCurrentInningMarker([entry("이전 이닝 마지막 아웃.")], 1, "BOTTOM")).toBe(true);
    expect(needsCurrentInningMarker([entry("현재 이닝 진행 중.")], 1, "TOP")).toBe(false);
  });

  it("출루는 굵게, 득점은 빨간색, 아웃은 굵지 않게 분류한다", () => {
    expect(gameLogEntryClasses(entry("타자, 좌전 안타."))).toContain("reached");
    expect(gameLogEntryClasses(entry("타자, 2점 홈런!"))).toContain("scoring");
    expect(gameLogEntryClasses(entry("타자, 병살타 아웃."))).not.toContain("reached");
    expect(gameLogEntryClasses(entry("타자, 희생플라이. 주자 득점."))).toContain("scoring");
    expect(gameLogEntryClasses(entry("타자, 희생플라이. 주자 득점."))).not.toContain("reached");
  });
});
