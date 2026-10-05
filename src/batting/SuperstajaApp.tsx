import { Component, lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import kboStyleUrl from "../styles.css?url";
import mlbStyleUrl from "../../_mlb/src/styles.css?url";
import type { BattingLeague } from "./LeagueSwitch";

const KboApp = lazy(() => import("../App"));
const MlbApp = lazy(() => import("../../_mlb/src/App"));

class BattingErrorBoundary extends Component<{ league: BattingLeague; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    const { league } = this.props;
    const otherLeague = league === "MLB" ? "KBO" : "MLB";
    return <main className="batting-loading batting-load-error" role="alert"><div><h1>{league} 화면을 열지 못했습니다.</h1><p>화면을 불러오는 중 오류가 발생했습니다. 다시 열어주세요.</p><button onClick={() => window.location.reload()}>다시 열기</button><a href={`/superstaja/?league=${otherLeague}`}>{otherLeague}로 이동</a><a href="/">게임 선택 화면</a></div></main>;
  }
}

export function initialBattingLeague(search: string): BattingLeague {
  return new URLSearchParams(search).get("league") === "MLB" ? "MLB" : "KBO";
}

export default function SuperstajaApp() {
  const [league, setLeague] = useState<BattingLeague>(() => initialBattingLeague(window.location.search));
  const [styleFailed, setStyleFailed] = useState(false);
  useEffect(() => {
    setStyleFailed(false);
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = league === "KBO" ? kboStyleUrl : mlbStyleUrl;
    style.onerror = () => setStyleFailed(true);
    document.head.append(style);
    document.title = `슈퍼스타자 · ${league}`;
    const url = new URL(window.location.href);
    url.searchParams.set("league", league);
    window.history.replaceState(null, "", url);
    return () => { style.onerror = null; style.remove(); };
  }, [league]);
  const loading = <div className="batting-loading" role="status">슈퍼스타자 · {league} 리그 준비 중…</div>;
  return <>
    {styleFailed && <div className="batting-style-error" role="alert">화면 스타일을 불러오지 못했습니다. <button onClick={() => window.location.reload()}>다시 열기</button></div>}
    <BattingErrorBoundary key={league} league={league}><Suspense fallback={loading}>{league === "KBO" ? <KboApp onLeagueChange={setLeague} /> : <MlbApp onLeagueChange={setLeague} />}</Suspense></BattingErrorBoundary>
  </>;
}
