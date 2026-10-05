import { userGameStreaks } from "../engine/milestones";
import type { SeasonState } from "../engine/types";

export function UserStreaks({ state }: { state: SeasonState }) {
  const streaks = userGameStreaks(state);
  const lines = [
    streaks.hits >= 10 ? `${streaks.hits}경기 연속안타 중입니다.` : "",
    streaks.onBase >= 10 ? `${streaks.onBase}경기 연속출루 중입니다.` : "",
    streaks.homeRuns >= 2 ? `${streaks.homeRuns}경기 연속홈런 중입니다.` : "",
  ].filter(Boolean);
  if (!lines.length) return null;
  return <div className="user-streaks" aria-live="polite">{lines.map(line => <p key={line}>{line}</p>)}</div>;
}

