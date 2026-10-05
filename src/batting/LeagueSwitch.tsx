export type BattingLeague = "KBO" | "MLB";
export interface BattingAppProps { onLeagueChange?: (league: BattingLeague) => void }

export function LeagueSwitch({ league, onChange }: { league: BattingLeague; onChange?: (league: BattingLeague) => void }) {
  if (!onChange) return null;
  return <fieldset className="batting-league-selector"><legend>플레이할 리그</legend><div>{(["KBO", "MLB"] as const).map((value) => <button type="button" aria-pressed={league === value} key={value} className={league === value ? "selected" : ""} onClick={() => onChange(value)}><strong>{value}</strong><span>{value === "KBO" ? "10구단 · 144경기" : "30구단 · 162경기"}</span></button>)}</div></fieldset>;
}
