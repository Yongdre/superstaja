import { describe, expect, it } from "vitest";
import { createNewSeason } from "../../engine/gameEngine";
import { parseManualSave, serializeManualSave } from "../gameStore";

describe("수동 저장 슬롯 형식", () => {
  it("저장 시각과 전체 시즌 상태를 함께 보존한다", () => {
    const state = createNewSeason({ playerName: "백업 타자", seed: 33 });
    const savedAt = "2026-09-03T12:34:00.000Z";
    const restored = parseManualSave(serializeManualSave(state, savedAt));
    expect(restored.savedAt).toBe(savedAt);
    expect(restored.state).toEqual(state);
  });

  it("봉투 형식이 아닌 기존 시즌 JSON도 읽을 수 있다", () => {
    const state = createNewSeason({ playerName: "기존 타자", seed: 44 });
    const restored = parseManualSave(JSON.stringify(state));
    expect(restored.savedAt).toBeUndefined();
    expect(restored.state).toEqual(state);
  });
});
