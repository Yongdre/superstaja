export type AppTab = "game" | "schedule" | "standings" | "leaders" | "records" | "save";

export const navigationItems: Array<{ id: AppTab; icon: string; label: string; mobileLabel?: string }> = [
  { id: "game", icon: "◉", label: "경기" },
  { id: "schedule", icon: "▦", label: "일정" },
  { id: "standings", icon: "≡", label: "순위" },
  { id: "leaders", icon: "★", label: "리그 기록" },
  { id: "records", icon: "▤", label: "선수 기록" },
  { id: "save", icon: "↓", label: "저장 / 불러오기", mobileLabel: "저장 /\n불러오기" },
];

export function Navigation({ tab, onNavigate, mobile = false, awaitingAtBat = false }: {
  tab: AppTab;
  onNavigate: (tab: AppTab) => void;
  mobile?: boolean;
  awaitingAtBat?: boolean;
}) {
  return <nav className={mobile ? "mobile-nav" : undefined} aria-label={mobile ? "모바일 메뉴" : "주 메뉴"}>
    {navigationItems.map((item) => <button key={item.id} type="button" className={tab === item.id ? "active" : ""}
      aria-label={item.label} aria-current={tab === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
      <i aria-hidden="true">{item.icon}</i><span>{mobile ? item.mobileLabel ?? item.label : item.label}</span>
      {!mobile && item.id === "game" && awaitingAtBat && <b />}
    </button>)}
  </nav>;
}
