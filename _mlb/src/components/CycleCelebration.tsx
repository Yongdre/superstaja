import { useEffect, useRef, useState } from "react";
import { milestoneNotices, walkOffText } from "../engine/achievements";
import { hasCycle } from "../engine/milestones";
import type { SeasonState } from "../engine/types";

export const CYCLE_DISPLAY_MS = 2000;
export const PLAY_DISPLAY_MS = 1000;
export const ACHIEVEMENT_DISPLAY_MS = 2000;

interface Celebration {
  label: string;
  text: string;
  durationMs: number;
}

export function celebrationsForTransition(before: SeasonState, after: SeasonState): Celebration[] {
  const previous = before.game;
  const game = after.game;
  if (!previous || !game || before.season !== after.season || previous.fixture.id !== game.fixture.id || previous.competition !== game.competition) return [];
  const prior = previous.userGameStats;
  const current = game.userGameStats;
  const homeRuns = current.hr - prior.hr;
  const rbi = current.rbi - prior.rbi;
  const runs = current.runs - prior.runs;
  const notices: Celebration[] = [];
  if (homeRuns > 0) notices.push({ label: "HOME RUN", text: `${rbi}점 홈런!`, durationMs: PLAY_DISPLAY_MS });
  else if (rbi > 0) notices.push({ label: "RBI", text: `${rbi}타점!`, durationMs: PLAY_DISPLAY_MS });
  if (runs > 0 && homeRuns === 0) notices.push({ label: "RUN", text: "득점 성공!", durationMs: PLAY_DISPLAY_MS });
  if (!previous.walkOff && game.walkOff) {
    notices.push({ label: "WALK-OFF", text: walkOffText(game.walkOff.outcome), durationMs: ACHIEVEMENT_DISPLAY_MS });
    notices.push({ label: "VICTORY", text: `${after.leagueData.teams[game.fixture.home].name} 승리!`, durationMs: ACHIEVEMENT_DISPLAY_MS });
  }
  if (!hasCycle(prior) && hasCycle(current)) notices.push({ label: "HIT FOR THE CYCLE", text: "사이클링 히트 달성!!", durationMs: CYCLE_DISPLAY_MS });
  notices.push(...milestoneNotices(before, after).map(notice => ({ ...notice, durationMs: ACHIEVEMENT_DISPLAY_MS })));
  return notices;
}

export function scheduleCycleDismiss(dismiss: () => void): () => void {
  const timer = window.setTimeout(dismiss, CYCLE_DISPLAY_MS);
  return () => window.clearTimeout(timer);
}

export function CycleCelebration({ state }: { state: SeasonState }) {
  const previous = useRef(state);
  const nextId = useRef(0);
  const [queue, setQueue] = useState<Array<Celebration & { id: number }>>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before.season !== state.season || before.game?.fixture.id !== state.game?.fixture.id) {
      setQueue([]);
      return;
    }
    const added = celebrationsForTransition(before, state);
    const pending = added.map(notice => ({ ...notice, id: nextId.current++ }));
    if (pending.length) setQueue(current => [...current, ...pending]);
  }, [state]);
  const active = queue[0];
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setQueue(current => current.slice(1)), active.durationMs);
    return () => window.clearTimeout(timer);
  }, [active]);
  return active ? <div className="cycle-celebration" role="status"><div><span>{active.label}</span><strong>{active.text}</strong></div></div> : null;
}
