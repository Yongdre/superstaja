import { useEffect, useRef, useState } from "react";
import { BatterPanel } from "./components/BatterPanel";
import { GameEnd } from "./components/GameEnd";
import { GameLog } from "./components/GameLog";
import { Leaderboard } from "./components/Leaderboard";
import { RecordsView } from "./components/RecordsView";
import { ScheduleView } from "./components/ScheduleView";
import { Scoreboard } from "./components/Scoreboard";
import { Standings } from "./components/Standings";
import { Navigation, navigationItems as nav } from "./components/Navigation";
import type { AppTab as Tab } from "./components/Navigation";
import { builtInLeagueDatasets, defaultLeagueDataset, getBuiltInLeagueDataset, leagueDataTemplate } from "./data/leagueDataset";
import {
  applyUserChoice,
  createNewSeason,
  defaultSeasonConfig,
  getHeadToHead,
  homeAwayLabel,
  opponentOf,
  revealGameResult,
  resolveUserSteal,
  startNextGame,
  startNextSeason,
} from "./engine/gameEngine";
import { userFieldPositionLabels, userFieldPositions } from "./engine/types";
import type { LeagueDataset, SeasonConfig, SeasonGoals, SeasonState, UserChoice } from "./engine/types";
import { exportGame, exportLeagueData, getManualSaveSlotSummary, hasSavedGame, importGame, importLeagueData, loadGame, loadGameFromSlot, manualSaveSlots, saveGame, saveGameToSlot } from "./store/gameStore";
import type { ManualSaveSlot } from "./store/gameStore";
import { postseasonStageLabel } from "./engine/postseason";

const formatSlotTime = (savedAt?: string) => savedAt
  ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(savedAt))
  : "저장 시각 없음";

function MainMenu({ onStart, onLoad, onLoadSlot, onImport }: {
  onStart: (config: Partial<SeasonConfig>, dataset: LeagueDataset) => void;
  onLoad: () => void;
  onLoadSlot: (slot: ManualSaveSlot) => void;
  onImport: (file: File) => void;
}) {
  const [setup, setSetup] = useState(false);
  const [config, setConfig] = useState(defaultSeasonConfig);
  const [dataset, setDataset] = useState<LeagueDataset>(() => structuredClone(defaultLeagueDataset));
  const [dataMessage, setDataMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dataInputRef = useRef<HTMLInputElement>(null);
  const slotSummaries = manualSaveSlots.map(getManualSaveSlotSummary);
  const update = <K extends keyof SeasonConfig>(key: K, value: SeasonConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  const updateDebutYear = (year: number) => {
    update("debutYear", year);
    const builtIn = getBuiltInLeagueDataset(year);
    if (builtIn) {
      setDataset(structuredClone(builtIn));
      setDataMessage(`${year}년 내장 JSON 자동 선택`);
    } else {
      setDataMessage(`${year}년 내장 JSON 없음 · ${dataset.label} 유지`);
    }
  };
  return (
    <main className="menu-shell">
      <div className="menu-noise" />
      <section className="menu-card">
        <div className="menu-brand"><span className="brand-ball">K</span><div><strong>KBO CAREER SIM</strong><small>TRUE TALENT · INDEPENDENT SEASONS</small></div></div>
        <div className="menu-copy"><span className="season-badge">KBO CAREER</span><h1>슈퍼스타자</h1><p>편집 가능한 예상 성적을 기반으로 독립적으로 흘러가는 KBO 세계.<br />데뷔부터 은퇴까지, 오직 한 선수의 타석 결과만 결정합니다.</p></div>

        {!setup ? <div className="menu-actions">
          <button className="menu-primary" onClick={() => setSetup(true)}><span>새 시즌 시작</span><b>→</b></button>
          <button onClick={onLoad} disabled={!hasSavedGame()}><span>자동 저장 이어하기</span><b>{hasSavedGame() ? "CONTINUE" : "NO SAVE"}</b></button>
          <div className="menu-save-slots"><span>수동 저장 슬롯</span><div className="menu-slot-grid">{slotSummaries.map((summary) => <button key={summary.slot} disabled={summary.status !== "READY"} onClick={() => onLoadSlot(summary.slot)}><span><small>SLOT {summary.slot}</small><strong>{summary.status === "READY" ? `${summary.season} · ${summary.playerName}` : summary.status === "INVALID" ? "읽기 오류" : "빈 슬롯"}</strong>{summary.status === "READY" && <em>{summary.games}경기 · {formatSlotTime(summary.savedAt)}</em>}</span><b>{summary.status === "READY" ? "LOAD" : summary.status}</b></button>)}</div></div>
          <button onClick={() => inputRef.current?.click()}><span>JSON 세이브 불러오기</span><b>IMPORT</b></button>
        </div> : <div className="season-setup">
          <div className="setup-heading"><button onClick={() => setSetup(false)}>←</button><div><span className="eyebrow">NEW SEASON</span><h2>선수와 목표 설정</h2></div></div>
          <div className="form-row"><label><span>선수 이름</span><input value={config.playerName} placeholder="이름 입력" onChange={(event) => update("playerName", event.target.value)} /></label><label><span>포지션</span><select value={config.position} onChange={(event) => update("position", event.target.value as SeasonConfig["position"])}>{userFieldPositions.map((position) => <option value={position} key={position}>{userFieldPositionLabels[position]}</option>)}</select></label></div>
          <div className="form-row"><label><span>데뷔 연도</span><input type="number" min="1982" max="2199" value={config.debutYear} onChange={(event) => updateDebutYear(Number(event.target.value))} /></label><label><span>리그 데이터</span><input value={dataset.label} readOnly /></label></div>
          <div className="league-data-box"><div><strong>리그 데이터 JSON</strong><span>{dataMessage || `현재 ${dataset.label} 사용 중`}</span></div><div><button type="button" onClick={() => exportLeagueData(leagueDataTemplate, "kbo-league-data-template.json")}>최신 입력 템플릿</button><button type="button" onClick={() => exportLeagueData(dataset)}>현재 데이터 내려받기</button><button type="button" onClick={() => dataInputRef.current?.click()}>수정한 JSON 가져오기</button></div></div>
          <p className="data-note">내장 JSON: {builtInLeagueDatasets.map((item) => item.sourceSeason).join(", ")}년 · 새 파일은 <code>src/data/seasons/kbo-league-data-YYYY.json</code>에 추가하세요. 파일이 없는 연도는 현재 데이터를 유지하거나 수정한 JSON을 가져올 수 있습니다.</p>
          <div className="form-row"><label><span>타순</span><select value={config.battingOrder} onChange={(event) => update("battingOrder", Number(event.target.value))}>{Array.from({ length: 9 }, (_, index) => <option value={index + 1} key={index}>{index + 1}번</option>)}</select></label><label><span>RNG Seed</span><input type="number" value={config.seed} onChange={(event) => update("seed", Number(event.target.value))} /></label></div>
          <div className="form-row"><label><span>목표 타율 하한</span><input type="number" min="0" max="1" step="0.001" value={config.targetAvgMin} onChange={(event) => update("targetAvgMin", Number(event.target.value))} /></label><label><span>목표 타율 상한</span><input type="number" min="0" max="1" step="0.001" value={config.targetAvgMax} onChange={(event) => update("targetAvgMax", Number(event.target.value))} /></label></div>
          <div className="form-row"><label><span>목표 홈런(최대)</span><input type="number" min="0" value={config.homeRunCap} onChange={(event) => update("homeRunCap", Number(event.target.value))} /></label><label><span>도루 성공률 (%)</span><input type="number" min="25" max="95" value={Math.round(config.stealSuccess * 100)} onChange={(event) => update("stealSuccess", Number(event.target.value) / 100)} /></label></div>
          <p className="data-note">입력한 도루 성공률을 매 시도 그대로 적용합니다. 투수·포수·주루 능력과 이전 성공·실패는 확률을 바꾸지 않습니다.</p>
          <label className="checkbox"><input type="checkbox" checked={config.enforceHomeRunCap} onChange={(event) => update("enforceHomeRunCap", event.target.checked)} /><span>홈런 한도에 도달하면 HR 선택 비활성화</span></label>
          <label className="checkbox final-season-option"><input type="checkbox" checked={config.isFinalSeason} onChange={(event) => update("isFinalSeason", event.target.checked)} /><span>{config.debutYear} 시즌을 마지막으로 은퇴</span></label>
          <button className="menu-primary" disabled={!config.playerName.trim()} onClick={() => onStart(config, dataset)}><span>{config.debutYear}년 커리어 시작</span><b>{config.isFinalSeason ? "FINAL SEASON" : "PLAY BALL"}</b></button>
        </div>}
        <input className="hidden-input" ref={inputRef} type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && onImport(event.target.files[0])} />
        <input className="hidden-input" ref={dataInputRef} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void importLeagueData(file).then((next) => { setDataset(next); if (next.sourceSeason) update("debutYear", next.sourceSeason); setDataMessage(`${next.label} 불러오기 완료`); }).catch((error: unknown) => setDataMessage(error instanceof Error ? error.message : "리그 데이터를 읽지 못했습니다.")); event.target.value = ""; }} />
        <footer><span>10 TEAMS</span><span>144 GAMES</span><span>SEEDED RNG</span><span>AUTOSAVE</span></footer>
      </section>
    </main>
  );
}

function SaveCenter({ state, onSave, onLoadSlot, onImport, onMenu }: { state: SeasonState; onSave: () => void; onLoadSlot: (slot: ManualSaveSlot) => void; onImport: (file: File) => void; onMenu: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [slotSummaries, setSlotSummaries] = useState(() => manualSaveSlots.map(getManualSaveSlotSummary));
  const [slotMessage, setSlotMessage] = useState("");
  const saveToSlot = (slot: ManualSaveSlot) => {
    const current = slotSummaries.find((summary) => summary.slot === slot);
    if (current?.status !== "EMPTY" && !window.confirm(`슬롯 ${slot}의 기존 저장을 현재 상태로 덮어쓸까요?`)) return;
    saveGameToSlot(slot, state);
    setSlotSummaries(manualSaveSlots.map(getManualSaveSlotSummary));
    setSlotMessage(`슬롯 ${slot}에 저장했습니다.`);
  };
  return (
    <section className="card save-center">
      <header className="section-header"><div><span className="eyebrow">SAVE DATA</span><h2>저장 / 불러오기</h2></div><span className="save-status"><i /> 자동 저장 사용 중</span></header>
      <div className="save-slot"><div className="save-icon">{String(state.season).slice(-2)}</div><div><small>LOCAL SAVE · SCHEMA V{state.schemaVersion}</small><strong>{state.season} KBO · {state.config.playerName}</strong><span>커리어 {state.career.debutYear}–현재 · {state.teamRecords[state.config.userTeam].games}경기 · RNG {state.rngState}</span></div></div>
      <div className="save-actions"><button className="primary-button" onClick={onSave}>자동 저장 갱신</button><button className="ghost-button" onClick={() => exportGame(state)}>세이브 JSON 내보내기</button><button className="ghost-button" onClick={() => inputRef.current?.click()}>세이브 JSON 가져오기</button><button className="ghost-button" onClick={() => exportLeagueData(state.leagueData)}>리그 데이터 JSON</button></div>
      <section className="manual-save-section"><header><div><span className="eyebrow">MANUAL BACKUP</span><h3>수동 저장 슬롯</h3></div><small>{slotMessage || "원하는 시점의 상태를 슬롯별로 보관합니다."}</small></header><div className="manual-save-grid">{slotSummaries.map((summary) => <article className={summary.status.toLowerCase()} key={summary.slot}><div><small>SLOT {summary.slot}</small><strong>{summary.status === "READY" ? `${summary.season} KBO · ${summary.playerName}` : summary.status === "INVALID" ? "읽을 수 없는 저장" : "빈 슬롯"}</strong><span>{summary.status === "READY" ? `${summary.games}경기 · ${formatSlotTime(summary.savedAt)}` : summary.status === "INVALID" ? "새로 저장하면 복구됩니다." : "저장된 백업이 없습니다."}</span></div><div><button className="primary-button" onClick={() => saveToSlot(summary.slot)}>{summary.status === "EMPTY" ? "저장" : "덮어쓰기"}</button><button className="ghost-button" disabled={summary.status !== "READY"} onClick={() => onLoadSlot(summary.slot)}>불러오기</button></div></article>)}</div></section>
      <div className="save-note"><strong>사용 중인 데이터셋 · {state.leagueData.label}</strong><p>이 리그 데이터는 세이브에도 포함됩니다. 새 커리어에서 다른 데이터를 쓰려면 메인 메뉴의 새 시즌 설정에서 수정한 리그 데이터 JSON을 가져오세요.</p></div>
      <div className="save-note"><strong>결정적 시뮬레이션</strong><p>세이브에는 현재 이닝, 주자, 타순, 선수 기록, 전체 일정과 RNG 상태가 모두 포함됩니다. 같은 상태와 같은 선택은 같은 결과를 만듭니다.</p></div>
      <button className="text-button" onClick={onMenu}>메인 메뉴로 나가기</button>
      <input className="hidden-input" ref={inputRef} type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && onImport(event.target.files[0])} />
    </section>
  );
}

function GamePage({ state, onChoice, onSteal, onReveal, onNext, onNavigate }: {
  state: SeasonState; onChoice: (choice: UserChoice) => void; onSteal: (attempt: boolean) => void; onReveal: () => void; onNext: (settings?: SeasonGoals, dataset?: LeagueDataset) => void; onNavigate: (tab: Tab) => void;
}) {
  const game = state.game!;
  const opponent = opponentOf(game.fixture, state.config.userTeam);
  const h2h = getHeadToHead(state, state.config.userTeam, opponent);
  const postseason = game.competition !== "REGULAR_SEASON";
  const awaitingResult = game.phase === "GAME_END_TRANSITION";
  const regularGameNumber = state.teamRecords[state.config.userTeam].games + (game.finalized ? 0 : 1);
  if (game.phase === "GAME_END" || game.phase === "SEASON_END") return <GameEnd state={state} onNext={onNext} onNavigate={(tab) => onNavigate(tab as Tab)} />;
  return (
    <div className="game-page">
      <div className="match-meta"><div><span className="eyebrow">{postseason ? postseasonStageLabel[game.competition] : `GAME ${regularGameNumber} / 144`}</span><h2>vs {state.leagueData.teams[opponent].name} <small>{game.fixture.gameInSeries}차전</small></h2></div><div><span>{homeAwayLabel(game.fixture, state.config.userTeam, state.leagueData)}</span><strong>{postseason ? "포스트시즌 기록은 별도 집계" : `상대전적 ${h2h.wins}승 ${h2h.losses}패 ${h2h.ties}무`}</strong></div></div>
      <div className="game-columns"><div className="game-main"><Scoreboard game={game} dataset={state.leagueData} /><GameLog entries={game.log} focusLogId={awaitingResult ? undefined : game.focusLogId} inning={game.inning} half={game.half} finished={awaitingResult} />{awaitingResult && <div className="game-finished-banner card"><div><span className="eyebrow">FINAL</span><strong>경기가 끝났습니다</strong><small>마지막 문자중계를 확인한 뒤 결과 화면으로 이동하세요.</small></div><button className="primary-button" onClick={onReveal}>경기 결과 보기 →</button></div>}</div><BatterPanel state={state} onChoice={onChoice} onSteal={onSteal} /></div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<SeasonState | null>(null);
  const [tab, setTab] = useState<Tab>("game");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!state) return;
    saveGame(state);
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const loadJson = async (file: File) => {
    try { setState(await importGame(file)); setTab("game"); setToast("JSON 세이브를 불러왔습니다."); }
    catch (error) { setToast(error instanceof Error ? error.message : "세이브를 불러오지 못했습니다."); }
  };

  const loadAutoSave = () => {
    try {
      const saved = loadGame();
      if (!saved) return;
      setState(saved);
      setTab("game");
      setToast("자동 저장을 불러왔습니다.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "자동 저장을 불러오지 못했습니다.");
    }
  };
  const loadManualSlot = (slot: ManualSaveSlot) => {
    try {
      const saved = loadGameFromSlot(slot);
      if (!saved) { setToast(`슬롯 ${slot}이 비어 있습니다.`); return; }
      setState(saved);
      setTab("game");
      setToast(`슬롯 ${slot}을 불러왔습니다.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : `슬롯 ${slot}을 불러오지 못했습니다.`);
    }
  };

  if (!state) return <><MainMenu onStart={(config, dataset) => { setState(createNewSeason(config, dataset)); setTab("game"); }} onLoad={loadAutoSave} onLoadSlot={loadManualSlot} onImport={loadJson} />{toast && <div className="toast">{toast}</div>}</>;

  const renderTab = () => {
    switch (tab) {
      case "game": return <GamePage state={state} onChoice={(choice) => setState((current) => current ? applyUserChoice(current, choice) : current)} onSteal={(attempt) => setState((current) => current ? resolveUserSteal(current, attempt) : current)} onReveal={() => setState((current) => current ? revealGameResult(current) : current)} onNext={(settings, dataset) => setState((current) => current ? (current.game?.phase === "SEASON_END" && settings ? startNextSeason(current, settings, dataset ?? getBuiltInLeagueDataset(current.season + 1) ?? current.leagueData) : startNextGame(current)) : current)} onNavigate={setTab} />;
      case "schedule": return <ScheduleView state={state} />;
      case "standings": return <Standings state={state} />;
      case "leaders": return <Leaderboard state={state} />;
      case "records": return <RecordsView state={state} />;
      case "save": return <SaveCenter state={state} onSave={() => { saveGame(state); setToast("자동 저장을 갱신했습니다."); }} onLoadSlot={loadManualSlot} onImport={loadJson} onMenu={() => setState(null)} />;
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="app-brand"><span className="brand-ball">K</span><div><strong>KBO SIM</strong><small>{state.season} SEASON</small></div></div>
        <Navigation tab={tab} onNavigate={setTab} awaitingAtBat={state.game?.phase === "USER_AT_BAT"} />
        <div className="sidebar-season"><span>{state.progress === "REGULAR_SEASON" ? "REGULAR SEASON" : state.progress === "POSTSEASON" ? "POSTSEASON" : "SEASON COMPLETE"}</span><strong>{state.progress === "REGULAR_SEASON" ? state.teamRecords[state.config.userTeam].games : state.postseason?.games.length ?? 0}<small>{state.progress === "REGULAR_SEASON" ? " / 144 G" : " PS GAMES"}</small></strong><div><i style={{ width: `${state.progress === "REGULAR_SEASON" ? state.teamRecords[state.config.userTeam].games / 144 * 100 : 100}%` }} /></div></div>
        <div className="seed-label">SEED · {state.config.seed}<span>{state.leagueData.label}</span></div>
      </aside>
      <main className="app-content">
        <header className="topbar"><div><span className="mobile-brand">KBO SIM</span><strong>{nav.find((item) => item.id === tab)?.label}</strong></div><div className="top-record"><span>{state.season} · {state.leagueData.teams[state.config.userTeam].shortName}</span><strong>{state.teamRecords[state.config.userTeam].wins}–{state.teamRecords[state.config.userTeam].losses}–{state.teamRecords[state.config.userTeam].ties}</strong><i />자동 저장됨</div></header>
        <div className="content-inner">{renderTab()}</div>
      </main>
      <Navigation tab={tab} onNavigate={setTab} mobile />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
