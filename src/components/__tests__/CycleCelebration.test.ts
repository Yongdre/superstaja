import { afterEach, expect, it, vi } from "vitest";
import { createNewSeason } from "../../engine/gameEngine";
import { CYCLE_DISPLAY_MS, PLAY_DISPLAY_MS, celebrationsForTransition, scheduleCycleDismiss } from "../CycleCelebration";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("사이클링 히트 알림은 2초 뒤 닫힌다", () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  const dismiss = vi.fn();
  scheduleCycleDismiss(dismiss);
  vi.advanceTimersByTime(1999);
  expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(dismiss).toHaveBeenCalledOnce();
});

it("경기 변경이나 컴포넌트 종료 시 이전 알림 타이머를 취소한다", () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  const dismiss = vi.fn();
  const cancel = scheduleCycleDismiss(dismiss);
  cancel();
  vi.advanceTimersByTime(2000);
  expect(dismiss).not.toHaveBeenCalled();
});

it("비홈런 타점 뒤 후속 타자 결과의 내 득점을 1초씩 순서대로 알린다", () => {
  const before = createNewSeason();
  const after = structuredClone(before);
  after.game!.userGameStats.rbi = 2;
  after.game!.userGameStats.runs = 1;
  expect(celebrationsForTransition(before, after)).toEqual([
    { label: "RBI", text: "2타점!", durationMs: PLAY_DISPLAY_MS },
    { label: "RUN", text: "득점 성공!", durationMs: PLAY_DISPLAY_MS },
  ]);
  expect(PLAY_DISPLAY_MS).toBe(1000);
});

it("홈런은 점수만 표시하고 타점·본인 득점을 중복 표시하지 않는다", () => {
  const before = createNewSeason();
  const after = structuredClone(before);
  after.game!.userGameStats.hr = 1;
  after.game!.userGameStats.rbi = 3;
  after.game!.userGameStats.runs = 1;
  expect(celebrationsForTransition(before, after)).toEqual([
    { label: "HOME RUN", text: "3점 홈런!", durationMs: PLAY_DISPLAY_MS },
  ]);
});

it("후속 타자에 의한 득점만 발생해도 알리고 이전 경기 통계는 재생하지 않는다", () => {
  const before = createNewSeason();
  const after = structuredClone(before);
  after.game!.userGameStats.runs = 1;
  expect(celebrationsForTransition(before, after).map(notice => notice.text)).toEqual(["득점 성공!"]);
  after.game!.fixture.id = "another-game";
  expect(celebrationsForTransition(before, after)).toEqual([]);
});

it("사이클링 히트는 타점 알림 다음에 기존대로 2초 표시한다", () => {
  const before = createNewSeason();
  before.game!.userGameStats = { ...before.game!.userGameStats, h: 3, doubles: 1, triples: 1, hr: 1 };
  const after = structuredClone(before);
  after.game!.userGameStats.h += 1;
  after.game!.userGameStats.rbi = 1;
  expect(celebrationsForTransition(before, after)).toEqual([
    { label: "RBI", text: "1타점!", durationMs: PLAY_DISPLAY_MS },
    { label: "HIT FOR THE CYCLE", text: "사이클링 히트 달성!!", durationMs: CYCLE_DISPLAY_MS },
  ]);
});
