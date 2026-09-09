import { useLayoutEffect, useRef } from "react";
import type { GameLogEntry, Half } from "../engine/types";

const inningText = (inning: number, half: Half) => `${inning}회${half === "TOP" ? "초" : "말"}`;

export function gameLogEntryClasses(entry: GameLogEntry, focused = false) {
  const isOut = /아웃|삼진|병살타|희생플라이|희생번트|땅볼|뜬공|직선타/.test(entry.text);
  const reached = !isOut && /안타|2루타|3루타|홈런|볼넷|고의사구|몸에 맞는 공|사구|출루|야수선택/.test(entry.text);
  const scoring = /득점|홈런|적시타|밀어내기/.test(entry.text);
  return [reached ? "reached" : "", scoring ? "scoring" : "", entry.important && !isOut ? "highlight-marker" : "", focused ? "focus-start" : ""].filter(Boolean).join(" ");
}

export function needsCurrentInningMarker(entries: GameLogEntry[], inning: number, half: Half) {
  const lastEntry = entries.at(-1);
  return Boolean(lastEntry && (lastEntry.inning !== inning || lastEntry.half !== half));
}

export function GameLog({ entries, focusLogId, inning, half, finished = false }: { entries: GameLogEntry[]; focusLogId?: number; inning: number; half: Half; finished?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const target = focusLogId ? container.querySelector<HTMLElement>(`[data-log-id="${focusLogId}"]`) : null;
    if (target) {
      container.scrollTo({ top: Math.max(0, target.offsetTop - container.offsetTop - 10), behavior: "smooth" });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [entries.length, focusLogId, inning, half]);
  const awaitingFirstPlay = needsCurrentInningMarker(entries, inning, half);
  return (
    <section className="game-log card">
      <header className="section-header"><div><span className="eyebrow">PLAY BY PLAY</span><h2>경기 중계</h2></div><span className="radio-label">● {finished ? "FINAL" : "LIVE"}</span></header>
      <div className="log-scroll" ref={scrollRef}>
        {entries.map((entry, index) => {
          const focused = entry.id === focusLogId;
          const showInning = index === 0 || focused || entries[index - 1].inning !== entry.inning || entries[index - 1].half !== entry.half;
          return <div key={entry.id} data-log-id={entry.id}>{showInning && <div className="inning-chip">{inningText(entry.inning, entry.half)}</div>}<p className={gameLogEntryClasses(entry, focused)}>{entry.text}</p></div>;
        })}
        {awaitingFirstPlay && <div className="inning-chip current-inning">{inningText(inning, half)}</div>}
      </div>
    </section>
  );
}
