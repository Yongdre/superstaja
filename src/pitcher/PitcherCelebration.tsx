import { useEffect, useRef, useState } from "react";
import { pitcherCelebrationsForTransition } from "./achievements";
import type { PitchCelebration } from "./achievements";
import type { PitcherState } from "./types";

export function PitcherCelebration({ state }: { state: PitcherState }) {
  const previous = useRef(state);
  const nextId = useRef(0);
  const [queue, setQueue] = useState<Array<PitchCelebration & { id: number }>>([]);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before.year !== state.year || before.game?.fixture.id !== state.game?.fixture.id) { setQueue([]); return; }
    const pending = pitcherCelebrationsForTransition(before, state).map((notice) => ({ ...notice, id: nextId.current++ }));
    if (pending.length) setQueue((current) => [...current, ...pending]);
  }, [state]);
  const active = queue[0];
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setQueue((current) => current.slice(1)), active.durationMs);
    return () => window.clearTimeout(timer);
  }, [active]);
  return active ? <div className="bp-celebration" role="status"><div><span>{active.label}</span><strong>{active.text}</strong></div></div> : null;
}
