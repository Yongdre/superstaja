import { useEffect, useRef, useState } from "react";
import { newCareerSeed } from "../engine/rng";
import { formatTeamStreak } from "../engine/milestones";
import { GameLog } from "../components/GameLog";
import { gameAchievementLabels } from "./achievements";
import { PitcherCelebration } from "./PitcherCelebration";
import { defaultPitcherDatasetOption, loadPitcherDataset, pitcherDatasetOptionsFor } from "./datasetLoader";
import { applyPitchChoice, careerStats, choiceLabels, combinedWalks, createPitcherCareer, currentBatter, currentSeasonStats, disabledReason, era, eraLabel, forcedHomeRunRemaining, innings, kPerNineLabel, nextPitcherSeason, nextPitcherStart, relievePitcher } from "./engine";
import { PitcherRankingsPage } from "./PitcherRankings";
import { pitcherTeamStreaks } from "./standings";
import { exportPitcherGame, hasPitcherSave, loadPitcherGame, parsePitcherSave, savePitcherGame } from "./storage";
import type { League, PitchChoice, PitcherConfig, PitcherDataset, PitcherState, PitchingStats, StartInterval } from "./types";

type Tab = "game" | "schedule" | "standings" | "rankings" | "records" | "save";
const tabs: { id: Tab; symbol: string; label: string; english: string }[] = [
  { id: "game", symbol: "◈", label: "마운드", english: "THE MOUND" },
  { id: "schedule", symbol: "▦", label: "등판 일정", english: "SCHEDULE" },
  { id: "standings", symbol: "≡", label: "팀 순위", english: "STANDINGS" },
  { id: "rankings", symbol: "♔", label: "투수 순위", english: "PITCHER RANKINGS" },
  { id: "records", symbol: "↗", label: "투구 기록", english: "RECORDS" },
  { id: "save", symbol: "⊞", label: "저장 / 불러오기", english: "SAVE GAME" },
];
const choices: { value: PitchChoice; label: string; sub: string; type?: string }[] = [
  { value: "OUT", label: "OUT", sub: "범타 · 병살", type: "out" },
  { value: "K", label: "K", sub: "삼진", type: "strikeout" },
  { value: "1B", label: "1B", sub: "안타" },
  { value: "2B", label: "2B", sub: "2루타" },
  { value: "3B", label: "3B", sub: "3루타" },
  { value: "HR", label: "HR", sub: "홈런", type: "homer" },
  { value: "BB", label: "BB", sub: "볼넷" },
  { value: "IBB", label: "IBB", sub: "고의사구" },
  { value: "HBP", label: "HBP", sub: "사구" },
  { value: "SH", label: "SH", sub: "희생번트" },
  { value: "SB", label: "SB", sub: "도루 성공", type: "running" },
  { value: "WP", label: "WP", sub: "폭투", type: "running" },
  { value: "CS", label: "CS / PO", sub: "도루실패 or 견제사", type: "running runner-out" },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`bp-brand ${compact ? "compact" : ""}`}><span className="bp-mark">BP<span /></span><div><strong>Best Pitcher<span>01</span></strong><small>KBO & MLB · STARTER CAREER</small></div></div>;
}

function FieldArt() {
  return <svg className="bp-field-art" viewBox="0 0 500 480" aria-hidden="true">
    <defs><linearGradient id="field-glow" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#5cdcc6" stopOpacity=".08" /><stop offset="1" stopColor="#5cdcc6" stopOpacity=".35" /></linearGradient></defs>
    <path d="M250 405 50 205A283 283 0 0 1 450 205Z" fill="url(#field-glow)" stroke="#5cdcc6" strokeOpacity=".3" />
    <path d="M250 405 145 300 250 195 355 300Z" fill="#102a30" stroke="#5cdcc6" strokeOpacity=".55" />
    <path d="M250 405 50 205M250 405 450 205" stroke="#5cdcc6" strokeOpacity=".5" strokeDasharray="4 7" />
    <path d="M100 225A212 212 0 0 1 400 225" fill="none" stroke="#5cdcc6" strokeOpacity=".16" />
    <circle cx="250" cy="300" r="28" fill="#5cdcc6" fillOpacity=".09" stroke="#5cdcc6" strokeOpacity=".35" />
    <rect x="237" y="296" width="26" height="6" rx="2" fill="#5cdcc6" />
    {[ [145, 300], [250, 195], [355, 300] ].map(([x, y]) => <rect key={x} x={x - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${x} ${y})`} fill="#aacbc8" />)}
    <path d="m243 400 14 0 0 7-7 7-7-7Z" fill="#aacbc8" />
    <circle cx="250" cy="300" r="65" fill="none" stroke="#5cdcc6" strokeOpacity=".2" strokeDasharray="2 8" />
    <text x="250" y="112" textAnchor="middle" fill="#90b4b8" fontSize="10" letterSpacing="5">YOUR CAREER STARTS HERE</text>
  </svg>;
}

function Setup({ onStart, onLoad, onImport }: { onStart: (config: PitcherConfig, dataset: PitcherDataset) => void; onLoad: () => void; onImport: (file: File) => void }) {
  const [dataset, setDataset] = useState<PitcherDataset | null>(null);
  const [config, setConfig] = useState<PitcherConfig>(() => ({ league: "KBO", dataId: defaultPitcherDatasetOption("KBO").id, playerName: "나의 투수", teamId: "SAM", throws: "R", debutYear: 2026, rotationSlot: 1, targetEra: 2.80, seed: newCareerSeed() }));
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setDataset(null); setDataLoading(true); setDataError("");
    loadPitcherDataset(config.dataId).then((next) => {
      if (cancelled) return;
      setDataset(next);
      setConfig((previous) => ({ ...previous, teamId: next.teams[previous.teamId] ? previous.teamId : next.league === "KBO" ? "SAM" : "BOS" }));
    }).catch(() => { if (!cancelled) setDataError("선수 데이터를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."); }).finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [config.dataId, retry]);
  const inputRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof PitcherConfig>(key: K, value: PitcherConfig[K]) => setConfig((previous) => ({ ...previous, [key]: value }));
  const selectLeague = (league: League) => setConfig((previous) => ({ ...previous, league, dataId: defaultPitcherDatasetOption(league).id, teamId: league === "KBO" ? "SAM" : "BOS" }));
  const saved = hasPitcherSave();
  return <main className="bp-setup-shell">
    <header className="bp-setup-header"><Brand /><a href="/">← 게임 선택 화면</a></header>
    <div className="bp-setup-layout">
      <section className="bp-intro"><span className="bp-eyebrow"><i /> ONE MOUND. YOUR STORY.</span><h1>당신의 손에서<br />시작되는 <em>에이스.</em></h1><p>KBO에서 MLB까지.<br />한 타자씩 결과를 결정하고,<br />당신만의 선발투수 커리어를 만드세요.</p><FieldArt /><div className="bp-intro-bottom"><span>01 / STARTER ONLY</span><span>02 / EVERY RESULT IS YOURS</span></div></section>
      <section className="bp-setup-card"><div className="bp-section-title"><div><span className="bp-eyebrow">NEW CAREER</span><h2>마운드에 오를 준비</h2></div><span className="bp-tag">선발투수</span></div>
        <form onSubmit={(event) => { event.preventDefault(); if (dataset && !dataLoading && dataset.id === config.dataId) onStart(config, dataset); }}>
          <fieldset className="bp-league-field"><legend>리그 선택</legend><div className="bp-league-switch">{(["KBO", "MLB"] as League[]).map((league) => <button type="button" key={league} aria-pressed={config.league === league} className={config.league === league ? "selected" : ""} onClick={() => selectLeague(league)}><strong>{league}</strong><small>{league === "KBO" ? "10구단 · 144경기" : "30구단 · 162경기"}</small><span>{config.league === league ? "●" : "○"}</span></button>)}</div></fieldset>
          <div className="bp-form-grid"><label>선수 이름<input required maxLength={40} value={config.playerName} onChange={(event) => update("playerName", event.target.value)} /></label><label>소속 팀<select value={config.teamId} disabled={!dataset || dataLoading} onChange={(event) => update("teamId", event.target.value)}>{!dataset && <option value={config.teamId}>선수 데이터 준비 중</option>}{Object.values(dataset?.teams ?? {}).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <label>데뷔 연도<input type="number" min={1982} max={2199} required value={config.debutYear} onChange={(event) => update("debutYear", Number(event.target.value))} /></label><label>선수 데이터 기준 연도<select value={config.dataId} onChange={(event) => update("dataId", event.target.value)}>{pitcherDatasetOptionsFor(config.league).map((entry) => <option key={entry.id} value={entry.id}>{entry.year}년</option>)}</select></label>
            <label>투구 손<select value={config.throws} onChange={(event) => update("throws", event.target.value as "L" | "R")}><option value="R">우완</option><option value="L">좌완</option></select></label><label>첫 등판 순번<select value={config.rotationSlot} onChange={(event) => update("rotationSlot", Number(event.target.value))}>{[1, 2, 3, 4, 5].map((slot) => <option key={slot} value={slot}>팀 {slot}번째 경기</option>)}</select></label>
          </div>
          <div className="bp-target-input"><div><span className="bp-eyebrow">MINIMUM SEASON ERA</span><strong>최저 방어율</strong><small>목표 방어율 이상을 기록하세요.</small></div><label><span className="bp-sr-only">최저 방어율</span><input type="number" required min="0" max="30" step="0.01" value={config.targetEra} onChange={(event) => update("targetEra", Number(event.target.value))} /><span>ERA</span></label></div>
          <p className="bp-note">시즌 100이닝 초과 후 목표보다 방어율이 0.50 이상 낮으면 3타석 연속 홈런을 선택해야 합니다.</p>
          <details className="bp-seed"><summary>Seed 설정 · {config.seed}</summary><label>같은 Seed와 선택으로 결과 재현<input type="number" min={1} max={4294967295} required value={config.seed} onChange={(event) => update("seed", Number(event.target.value))} /></label></details>
          <button className="bp-primary bp-start" type="submit" disabled={!dataset || dataLoading || dataset.id !== config.dataId}>{dataLoading ? "선수 데이터 준비 중…" : "커리어 시작"} <span>PLAY BALL →</span></button>
        </form>
        <div className="bp-resume"><button className="bp-secondary" disabled={!saved} onClick={onLoad}>자동 저장 이어하기 <span>↗</span></button><button className="bp-text-button" onClick={() => inputRef.current?.click()}>세이브 JSON 가져오기</button></div>
        {saved && <p className="bp-note">새 커리어를 시작하면 Best Pitcher 자동 저장이 교체됩니다.</p>}
        {dataLoading && <p className="bp-note" role="status">선택한 리그·시즌의 선수 데이터를 불러오는 중입니다.</p>}{dataError && <div className="bp-alert" role="alert">{dataError} <button className="bp-secondary" onClick={() => setRetry((previous) => previous + 1)}>다시 불러오기</button></div>}
        <input className="bp-hidden" ref={inputRef} type="file" accept=".json,application/json" onChange={(event) => { if (event.target.files?.[0]) onImport(event.target.files[0]); event.target.value = ""; }} />
      </section>
    </div><footer className="bp-setup-footer"><span>BEST PITCHER · KBO & MLB</span><span>선발투수 커리어 · 정규시즌 · 자동 저장</span></footer>
  </main>;
}

function StatStrip({ stats, season = false }: { stats: PitchingStats; season?: boolean }) {
  const values = season ? [["ERA", eraLabel(stats)], ["등판", stats.starts], ["승–패", `${stats.wins}–${stats.losses}`], ["볼넷", combinedWalks(stats)], ["K", stats.strikeouts], ["K/9", kPerNineLabel(stats)]] : [["IP", innings(stats.outs)], ["R / ER", `${stats.runs} / ${stats.earnedRuns}`], ["볼넷", combinedWalks(stats)], ["K", stats.strikeouts], ["K/9", kPerNineLabel(stats)], ["PITCHES", stats.pitches]];
  return <div className={`bp-stat-strip ${season ? "season" : ""}`}>{values.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function TargetStatus({ state }: { state: PitcherState }) {
  const stats = currentSeasonStats(state);
  const current = era(stats);
  const achieved = current !== null && current >= state.config.targetEra;
  return <div className={`bp-target-status ${achieved ? "achieved" : ""}`}><div><span className="bp-eyebrow">MINIMUM SEASON ERA</span><strong>{state.config.targetEra.toFixed(2)} <small>이상</small></strong></div><div><span>현재 {eraLabel(stats)}</span><b>{current === null ? "첫 이닝을 기다리는 중" : achieved ? "최저 방어율 목표 충족" : "목표 방어율 이상을 기록하세요."}</b></div></div>;
}

function Diamond({ state }: { state: PitcherState }) {
  const game = state.game!;
  const { away, home } = game.fixture;
  return <div className="bp-diamond-wrap"><div className="bp-field-overview"><div className="bp-diamond">
    <div className="bp-diamond-lines" /><div className="bp-mound"><span>SP</span><i /></div>
    {([2, 1, 3] as const).map((base) => <div key={base} className={`bp-base base-${base} ${game.bases[base - 1] ? "occupied" : ""}`} title={game.bases[base - 1]?.name ?? `${base}루 비어 있음`}><i /><span>{base}B</span>{game.bases[base - 1] && <small>{game.bases[base - 1]!.name}</small>}</div>)}
    <div className="bp-home" /><span className="bp-field-label">{game.phase === "FINISHED" ? "FINAL" : "ON THE MOUND"}</span>
  </div><div className="bp-field-status" aria-label="현재 이닝, 점수, 아웃카운트와 삼진" aria-live="polite"><span className="bp-field-inning" aria-label={`${game.inning}회${game.half === "TOP" ? "초" : "말"}`}>{game.inning}{game.half === "TOP" ? "▲" : "▼"}</span><span aria-label={`${state.dataset.teams[away].shortName} ${game.score[away]} 대 ${game.score[home]} ${state.dataset.teams[home].shortName}`}><small>{away}</small><strong>{game.score[away]} : {game.score[home]}</strong><small>{home}</small></span><b>{game.phase === "FINISHED" ? "경기 종료" : `${game.outs}아웃`}</b><b className="bp-field-strikeouts" aria-label={`오늘 ${game.stats.strikeouts}삼진`}>{game.stats.strikeouts}K</b></div></div><div className="bp-base-list" aria-label="주자 상황">{[1, 2, 3].map((base) => <span key={base} className={game.bases[base - 1] ? "occupied" : ""}><b>{base}루</b>{game.bases[base - 1]?.name ?? "—"}</span>)}</div></div>;
}

function Scoreboard({ state }: { state: PitcherState }) {
  const game = state.game!;
  const { home, away } = game.fixture;
  const inningCount = Math.max(9, game.inning);
  return <section className="bp-card bp-scoreboard"><div className="bp-score-top"><div><span className="bp-tag">{state.config.league}</span><span className="bp-eyebrow">{game.phase === "FINISHED" ? "GAME COMPLETE" : "LIVE GAME"}</span></div><span>{game.fixture.date ?? `${state.year} · ${game.fixture.day + 1}번째 경기일`}</span></div>
    <div className="bp-match"><div className="bp-score-team"><span className="bp-team-code" style={{ borderColor: state.dataset.teams[away].primary }}>{away}</span><div><strong>{state.dataset.teams[away].shortName}</strong><small>AWAY{away === state.config.teamId ? " · MY TEAM" : ""}</small></div><b>{game.score[away]}</b></div><div className="bp-inning"><strong>{game.phase === "FINISHED" ? "FINAL" : `${game.inning}회${game.half === "TOP" ? "초" : "말"}`}</strong><span>{game.phase === "FINISHED" ? `${game.inning} INNINGS` : `${game.outs} OUT`}</span><div className="bp-outs" aria-label={`${game.outs}아웃`}>{[0, 1, 2].map((out) => <i key={out} className={game.outs > out ? "on" : ""} />)}</div></div><div className="bp-score-team home"><b>{game.score[home]}</b><div><strong>{state.dataset.teams[home].shortName}</strong><small>HOME{home === state.config.teamId ? " · MY TEAM" : ""}</small></div><span className="bp-team-code" style={{ borderColor: state.dataset.teams[home].primary }}>{home}</span></div></div>
    <div className="bp-table-scroll"><table className="bp-line-score"><thead><tr><th>TEAM</th>{Array.from({ length: inningCount }, (_, index) => <th key={index}>{index + 1}</th>)}<th>R</th><th>H</th></tr></thead><tbody>{[away, home].map((id) => <tr key={id}><th>{state.dataset.teams[id].shortName}</th>{Array.from({ length: inningCount }, (_, index) => <td key={index} className={index === game.inning - 1 ? "current" : ""}>{game.lineScore[id][index] ?? ((index === game.inning - 1 && ((game.half === "TOP" && id === away) || (game.half === "BOTTOM" && id === home))) ? 0 : "—")}</td>)}<td className="total">{game.score[id]}</td><td>{game.hits[id]}</td></tr>)}</tbody></table></div>
    <Diamond state={state} />
  </section>;
}

function Commentary({ state }: { state: PitcherState }) {
  const game = state.game!;
  return <div className="bp-card bp-commentary"><GameLog entries={game.log.map((entry) => ({ id: entry.id, inning: entry.inning, half: entry.half, text: entry.text.replace(/NO HIT\s*·?\s*/g, ""), important: entry.important ?? false }))} focusLogId={game.phase === "FINISHED" ? undefined : game.focusLogId} inning={game.inning} half={game.half} finished={game.phase === "FINISHED"} /></div>;
}

function PitcherMatchup({ state, onChoice, onRelieve }: { state: PitcherState; onChoice: (choice: PitchChoice) => void; onRelieve: () => void }) {
  const game = state.game!;
  const batter = currentBatter(state);
  const forcedRemaining = forcedHomeRunRemaining(state);
  const [relieveOpen, setRelieveOpen] = useState(false);
  useEffect(() => setRelieveOpen(false), [game.fixture.id]);
  return <section className="bp-card bp-pitcher-panel bp-matchup-panel" aria-label="상대 타자와 결과 선택"><div className="bp-batter"><div><span className="bp-eyebrow">상대 타자 · AT THE PLATE</span><strong>{batter.name}</strong><small>{game.battingIndex[game.half === "TOP" ? game.fixture.away : game.fixture.home] + 1}번 타자 · {batter.bats === "L" ? "좌타" : batter.bats === "S" ? "양타" : "우타"} · {batter.position}</small></div><span>VS</span></div>
    <div className="bp-pitching-streaks" aria-live="polite"><span><strong>{game.streaks.strikeouts}</strong>타자 연속 삼진</span><span><strong>{game.streaks.outBatters}</strong>타자 연속 아웃</span></div>
    <div className="bp-decision-heading"><strong><i /> 이 타자의 결과를 선택하세요</strong><span>13 OUTCOMES</span></div>
      {forcedRemaining > 0 && <div className="bp-forced-homer" role="alert"><strong>목표보다 방어율이 너무 낮습니다</strong><span>강제 홈런 {forcedRemaining}타석 남음 · HR을 연속 선택하세요.</span></div>}
      <div className="bp-choice-grid">{choices.map((choice) => { const reason = disabledReason(state, choice.value); return <button key={choice.value} className={`bp-choice ${choice.type ?? ""}`} disabled={Boolean(reason)} title={reason ?? `${choiceLabels[choice.value]} 선택`} aria-label={`${choice.label} · ${choice.sub}`} onClick={() => onChoice(choice.value)}><strong>{choice.label}</strong><span>{choice.sub}</span></button>; })}</div>
      <div className="bp-choice-help"><p>OUT은 땅볼·뜬공·직선타·병살 등으로 처리됩니다. 삼진은 K로 선택하세요.</p><p>도루·폭투는 타석을 이어갑니다. 도루실패 or 견제사는 가장 앞선 주자 한 명을 아웃 처리하며, 3아웃이면 이닝이 끝납니다.</p><p>희생번트는 0·1사, 1·2루 주자가 있고 3루가 비어 있을 때 선택할 수 있습니다. 볼넷 기록에는 고의사구와 사구를 모두 합산합니다.</p></div>
      {!relieveOpen ? <button className="bp-relieve" disabled={forcedRemaining > 0} title={forcedRemaining ? "강제 홈런 선택을 먼저 마쳐 주세요." : undefined} onClick={() => setRelieveOpen(true)}>불펜에 마운드 넘기기 <span>↗</span></button> : <div className="bp-relieve-confirm"><p>현재 투구 기록으로 등판을 마치고, 남은 경기를 자동 진행합니다.</p><div><button className="bp-secondary" disabled={forcedRemaining > 0} onClick={onRelieve}>교체하고 경기 마치기</button><button className="bp-text-button" onClick={() => setRelieveOpen(false)}>계속 던지기</button></div></div>}
  </section>;
}

function PitcherGameRecords({ state }: { state: PitcherState }) {
  const game = state.game!;
  const finished = game.phase === "FINISHED";
  const season = currentSeasonStats(state);
  const achievements = gameAchievementLabels(game);
  return <section className="bp-card bp-pitcher-panel bp-game-records" aria-label="오늘 기록과 시즌 누적 기록"><div className="bp-player"><div className="bp-player-number">01</div><div><span className="bp-eyebrow">{finished ? "TODAY'S STARTER" : "NOW PITCHING"}</span><h1>{state.config.playerName}</h1><p>{state.config.throws === "L" ? "좌완" : "우완"} 선발투수 · {state.config.rotationSlot}선발 · {state.dataset.teams[state.config.teamId].shortName}</p></div><span className="bp-sp">SP</span></div>
    <div className="bp-strip-heading"><span>오늘 기록 · TODAY'S PITCHING</span><b>{game.stats.pitches >= 110 && !finished ? "110구 이상 · 교체 고려" : `${game.stats.battersFaced}타자 상대`}</b></div><StatStrip stats={game.stats} />
    {achievements.length > 0 && <div className="bp-achievement-badges" aria-label="등판 달성 기록">{achievements.map((label) => <span key={label}>{label}</span>)}</div>}
    {finished && <div className="bp-pitching-summary"><span>{game.decision === "W" ? "WINNING PITCHER" : game.decision === "L" ? "LOSING PITCHER" : "NO DECISION"}</span><strong>{game.stats.perfectGames ? "퍼펙트게임" : game.stats.noHitters && game.stats.runs === 0 ? "노히트노런" : game.stats.shutouts ? "완봉승" : game.stats.completeGames ? "완투" : "등판을 마쳤습니다"}</strong><p>{innings(game.stats.outs)}이닝 · {game.stats.runs}실점 · {game.stats.earnedRuns}자책 · {game.stats.strikeouts}삼진</p>{game.exit && <small>{game.exit.inning}회{game.exit.half === "TOP" ? "초" : "말"} {game.exit.outs}아웃 · {game.exit.pitches}구에 교체</small>}</div>}
    <div className="bp-season-line"><span className="bp-eyebrow">{state.year} SEASON</span><strong>시즌 누적 기록</strong></div><StatStrip stats={season} season /><TargetStatus state={state} />
  </section>;
}

function NextSeason({ state, onNext }: { state: PitcherState; onNext: (target: number, dataset: PitcherDataset) => void }) {
  const [target, setTarget] = useState(state.config.targetEra);
  const options = pitcherDatasetOptionsFor(state.config.league);
  const [dataId, setDataId] = useState((options.find((entry) => entry.year === state.year + 1) ?? options.find((entry) => entry.id === state.dataset.id))?.id ?? state.dataset.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return <form className="bp-next-season" onSubmit={async (event) => {
    event.preventDefault(); setLoading(true); setError("");
    try { onNext(target, dataId === state.dataset.id ? state.dataset : await loadPitcherDataset(dataId)); }
    catch { setError("선수 데이터를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."); }
    finally { setLoading(false); }
  }}><div><span className="bp-eyebrow">NEXT CHAPTER</span><h3>{state.year + 1}년에도 마운드로.</h3><p>최저 방어율을 설정하고 커리어를 이어가세요.</p></div><label>최저 방어율<input type="number" required min="0" max="30" step="0.01" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label><label>선수 데이터<select value={dataId} onChange={(event) => setDataId(event.target.value)}>{!options.some((entry) => entry.id === state.dataset.id) && <option value={state.dataset.id}>{state.dataset.year}년 · 현재 데이터</option>}{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.year}년</option>)}</select></label><button className="bp-primary" disabled={loading}>{loading ? "선수 데이터 준비 중…" : "다음 시즌 시작 →"}</button>{error && <p className="bp-alert" role="alert">{error}</p>}</form>;
}

function NextStart({ state, onNext }: { state: PitcherState; onNext: (interval: StartInterval) => void }) {
  const games = state.records[state.config.teamId].games;
  const total = state.config.league === "KBO" ? 144 : 162;
  if (games + 3 > total) return <button className="bp-primary" onClick={() => onNext(3)}>남은 시즌 마치기 →</button>;
  return <div className="bp-next-start"><span>다음 등판을 선택하세요 · 팀 경기 기준</span><div>{([3, 4, 5] as StartInterval[]).map((interval) => <button className="bp-secondary" key={interval} disabled={games + interval > total} onClick={() => onNext(interval)}><strong>{interval}경기 후</strong><small>MATCH {games + interval}</small></button>)}</div></div>;
}

function GamePage({ state, onChoice, onRelieve, onNext, onNextSeason }: { state: PitcherState; onChoice: (choice: PitchChoice) => void; onRelieve: () => void; onNext: (interval: StartInterval) => void; onNextSeason: (target: number, dataset: PitcherDataset) => void }) {
  const game = state.game!;
  const opponent = game.fixture.home === state.config.teamId ? game.fixture.away : game.fixture.home;
  const complete = game.phase === "FINISHED";
  return <div className="bp-game-page"><div className="bp-page-heading"><div><span className="bp-eyebrow">{state.year} REGULAR SEASON · START #{currentSeasonStats(state).starts.toString().padStart(2, "0")}</span><h2>{state.seasonComplete ? "한 시즌의 마침표." : `vs ${state.dataset.teams[opponent].name}`}</h2></div><div className="bp-match-location"><span>{game.fixture.home === state.config.teamId ? "HOME GAME" : "AWAY GAME"}</span><strong>{state.dataset.teams[game.fixture.home].name} 홈</strong></div></div>
    {complete && <div className="bp-end-banner"><div><span className="bp-eyebrow">{state.seasonComplete ? "SEASON COMPLETE" : "FINAL RESULT"}</span><strong>{state.seasonComplete ? `${state.year} 정규시즌 종료 · ERA ${eraLabel(state.stats)}` : `${game.decision === "W" ? "승리투수" : game.decision === "L" ? "패전투수" : "승패 없음"} · 오늘의 등판이 끝났습니다`}</strong><p>{state.seasonComplete ? `${state.stats.starts}선발 · ${state.stats.wins}승 ${state.stats.losses}패 · ${state.stats.strikeouts}삼진` : `MATCH ${state.records[state.config.teamId].games} 종료 · 선택한 다음 등판까지 경기를 자동 진행합니다.`}</p></div>{!state.seasonComplete && <NextStart state={state} onNext={onNext} />}</div>}
    {state.seasonComplete && <NextSeason key={state.year} state={state} onNext={onNextSeason} />}
    <div className="bp-game-flow"><Scoreboard state={state} />{!complete && <PitcherMatchup state={state} onChoice={onChoice} onRelieve={onRelieve} />}<Commentary state={state} /><PitcherGameRecords state={state} /></div>
  </div>;
}

function SchedulePage({ state }: { state: PitcherState }) {
  const ownGames = state.schedule.filter((fixture) => fixture.home === state.config.teamId || fixture.away === state.config.teamId);
  const resultMap = new Map(state.results.map((result) => [result.fixture.id, result]));
  const anchor = state.game?.phase === "FINISHED" ? state.records[state.config.teamId].games + state.startInterval : state.nextStartGameNumber;
  return <section className="bp-card bp-full-card"><PageTitle english="ROTATION & SCHEDULE" title="등판 일정" sub={`첫 등판 MATCH ${state.config.rotationSlot} · 현재 ${state.startInterval}경기 간격 · 팀 ${ownGames.length}경기`} /><p className="bp-note bp-schedule-note">예정 등판은 현재 간격 기준입니다. 경기가 끝날 때마다 3·4·5경기 후 등판을 새로 선택할 수 있습니다.</p><div className="bp-table-scroll"><table className="bp-data-table"><thead><tr><th>팀 경기</th><th>경기일</th><th>상대</th><th>구장</th><th>등판</th><th>결과</th><th>IP</th><th>ER</th><th>K</th></tr></thead><tbody>{ownGames.map((fixture, index) => {
    const opponent = fixture.home === state.config.teamId ? fixture.away : fixture.home;
    const result = resultMap.get(fixture.id);
    const active = state.game?.fixture.id === fixture.id && state.game.phase === "PITCHING";
    const planned = !result && !active && index + 1 >= anchor && (index + 1 - anchor) % state.startInterval === 0;
    const controlled = result ? result.controlled : active || planned;
    return <tr key={fixture.id} className={active ? "bp-highlight-row" : controlled ? "bp-start-row" : ""}><td>{index + 1}</td><td>{fixture.date ?? `DAY ${fixture.day + 1}`}</td><th>{state.dataset.teams[opponent].shortName}</th><td>{fixture.home === state.config.teamId ? "홈" : "원정"}</td><td><span className={controlled ? "bp-inline-start" : "bp-muted"}>{active ? "투구 중" : planned ? "선발 예정" : controlled ? "선발" : "휴식"}</span></td><td>{result ? `${result.awayScore}–${result.homeScore}${result.decision ? ` · ${result.decision}` : ""}` : "—"}</td><td>{result?.stats ? innings(result.stats.outs) : "—"}</td><td>{result?.stats?.earnedRuns ?? "—"}</td><td>{result?.stats?.strikeouts ?? "—"}</td></tr>;
  })}</tbody></table></div></section>;
}

function PageTitle({ english, title, sub }: { english: string; title: string; sub?: string }) {
  return <div className="bp-section-title bp-page-title"><div><span className="bp-eyebrow">{english}</span><h2>{title}</h2>{sub && <p>{sub}</p>}</div></div>;
}

function StandingsPage({ state }: { state: PitcherState }) {
  const [group, setGroup] = useState("ALL");
  const streaks = pitcherTeamStreaks(state.results);
  const pct = (id: string) => { const record = state.records[id]; return record.wins / Math.max(1, record.wins + record.losses); };
  const teams = Object.values(state.dataset.teams).filter((team) => group === "ALL" || `${team.league}-${team.division}` === group).sort((a, b) => pct(b.id) - pct(a.id) || state.records[b.id].wins - state.records[a.id].wins || a.id.localeCompare(b.id));
  const leader = state.records[teams[0].id];
  return <section className="bp-card bp-full-card"><PageTitle english="LEAGUE STANDINGS" title="팀 순위" sub={`${state.config.league} · ${state.year} 정규시즌`} />{state.config.league === "MLB" && <div className="bp-filter"><label>리그·지구<select value={group} onChange={(event) => setGroup(event.target.value)}><option value="ALL">전체 30개 구단</option>{["AL", "NL"].flatMap((league) => ["East", "Central", "West"].map((division) => <option key={`${league}-${division}`} value={`${league}-${division}`}>{league} {division}</option>))}</select></label></div>}
    <div className="bp-table-scroll"><table className="bp-data-table"><thead><tr><th>순위</th><th>팀</th><th>경기</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>승차</th><th>연속</th></tr></thead><tbody>{teams.map((team, index) => { const record = state.records[team.id]; return <tr key={team.id} className={team.id === state.config.teamId ? "bp-highlight-row" : ""}><td>{index + 1}</td><th><i className="bp-team-dot" style={{ background: team.primary }} />{team.name}{team.id === state.config.teamId && <span className="bp-my-team">MY</span>}</th><td>{record.games}</td><td>{record.wins}</td><td>{record.losses}</td><td>{record.ties}</td><td>{pct(team.id).toFixed(3)}</td><td>{index === 0 ? "—" : ((leader.wins - record.wins + record.losses - leader.losses) / 2).toFixed(1)}</td><td>{formatTeamStreak(streaks[team.id])}</td></tr>; })}</tbody></table></div><p className="bp-note">진행 중인 경기는 종료 후 팀 성적에 반영합니다. 무승부는 승률 계산에서 제외하며 연승·연패를 종료합니다.</p></section>;
}

const recordMetrics: { label: string; value: (stats: PitchingStats) => string | number; milestone?: boolean }[] = [
  { label: "등판 수", value: (stats) => stats.games },
  { label: "승–패", value: (stats) => `${stats.wins}–${stats.losses}` },
  { label: "방어율", value: eraLabel },
  { label: "실점", value: (stats) => stats.runs },
  { label: "자책", value: (stats) => stats.earnedRuns },
  { label: "볼넷 (고의사구, 사구)", value: (stats) => `${combinedWalks(stats)} (${stats.intentionalWalks}, ${stats.hitByPitch})` },
  { label: "삼진", value: (stats) => stats.strikeouts },
  { label: "K/9", value: kPerNineLabel },
  { label: "QS", value: (stats) => stats.qualityStarts, milestone: true },
  { label: "QS+", value: (stats) => stats.qualityStartsPlus, milestone: true },
  { label: "완투", value: (stats) => stats.completeGames },
  { label: "완봉", value: (stats) => stats.shutouts },
  { label: "노히트노런", value: (stats) => stats.noHitNoRuns, milestone: true },
  { label: "퍼펙트게임", value: (stats) => stats.perfectGames },
];

function RecordsPage({ state }: { state: PitcherState }) {
  const stats = currentSeasonStats(state);
  const career = careerStats(state);
  const unknownHistory = state.history.some((season) => season.detailedMilestonesKnown === false);
  const history = [...state.history, { year: state.year, league: state.config.league, teamName: state.dataset.teams[state.config.teamId].name, targetEra: state.config.targetEra, stats, record: state.records[state.config.teamId], detailedMilestonesKnown: true }];
  return <div className="bp-records-page"><section className="bp-card bp-full-card"><PageTitle english="PITCHING RECORDS" title={`${state.config.playerName}의 기록`} sub={`${state.config.throws === "L" ? "좌완" : "우완"} 선발투수 · ${state.config.debutYear}년 데뷔`} /><div className="bp-record-overview"><div><span className="bp-eyebrow">{state.year} SEASON</span><StatStrip stats={stats} season /><TargetStatus state={state} /></div><div><span className="bp-eyebrow">CAREER TOTAL</span><StatStrip stats={career} season /><p className="bp-note">볼넷은 일반 볼넷·고의사구·사구의 합계입니다. 괄호에는 고의사구와 사구를 각각 표시합니다. K/9는 9이닝당 삼진입니다.</p></div></div><div className="bp-table-scroll"><table className="bp-data-table"><thead><tr><th>기록</th><th>이번 시즌</th><th>통산</th></tr></thead><tbody>{recordMetrics.map((metric) => <tr key={metric.label}><th>{metric.label}</th><td>{metric.value(stats)}</td><td>{metric.milestone && unknownHistory ? "—" : metric.value(career)}</td></tr>)}</tbody></table></div><p className="bp-note">QS는 6이닝 이상 3실점 이하, QS+는 7이닝 이상 3실점 이하입니다. 등판 종료 시 확정합니다. 노히트노런은 9이닝 이상 무피안타·무실점이어야 합니다.</p>{unknownHistory && <p className="bp-note">이전 버전에서 저장한 과거 시즌의 QS·QS+·노히트노런 횟수는 복원할 경기별 기록이 없어 —로 표시합니다. 이번 시즌은 경기별 기록으로 복원합니다.</p>}</section>
    <section className="bp-card bp-full-card"><PageTitle english="SEASON BY SEASON" title="시즌 이력" /><div className="bp-table-scroll"><table className="bp-data-table"><thead><tr><th>시즌</th><th>리그 / 팀</th>{recordMetrics.map((metric) => <th key={metric.label}>{metric.label}</th>)}</tr></thead><tbody>{history.map((season) => <tr key={season.year}><th>{season.year}{season.year === state.year && !state.seasonComplete ? " · 진행 중" : ""}</th><td>{season.league} · {season.teamName}</td>{recordMetrics.map((metric) => <td key={metric.label}>{metric.milestone && season.detailedMilestonesKnown === false ? "—" : metric.value(season.stats)}</td>)}</tr>)}</tbody></table></div></section>
  </div>;
}


function SavePage({ state, saveError, onImport, onMenu, onSave }: { state: PitcherState; saveError: string; onImport: (file: File) => void; onMenu: () => void; onSave: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <section className="bp-card bp-full-card"><PageTitle english="KEEP YOUR CAREER" title="저장 / 불러오기" sub="매 선택마다 브라우저에 자동 저장합니다. JSON으로 다른 기기에 커리어를 옮길 수 있어요." /><div className="bp-save-profile"><div className="bp-player-number">SP</div><div><span className="bp-eyebrow">{state.config.league} · {state.year}</span><h3>{state.config.playerName}</h3><p>{state.dataset.teams[state.config.teamId].name} · {state.stats.starts}등판 완료 · ERA {eraLabel(currentSeasonStats(state))}</p></div><span className={`bp-save-indicator ${saveError ? "error" : ""}`}>{saveError ? "저장 확인 필요" : "자동 저장 중"}</span></div>
    {saveError && <p className="bp-alert" role="alert">{saveError} JSON 내보내기로 기록을 보관해 주세요.</p>}
    <div className="bp-save-actions"><button className="bp-primary" onClick={() => exportPitcherGame(state)}>세이브 JSON 내보내기 ↗</button><button className="bp-secondary" onClick={() => inputRef.current?.click()}>세이브 JSON 가져오기</button><button className="bp-secondary" onClick={onSave}>자동 저장 갱신</button></div>
    <div className="bp-save-notes"><strong>현재 커리어의 데이터</strong><p>{state.dataset.label}</p><p>리그·선수 데이터·현재 이닝·주자·투구 기록·전체 일정과 난수 상태를 함께 저장합니다.</p><p>브라우저 데이터를 삭제하면 자동 저장이 지워집니다. JSON 파일은 별도로 보관할 수 있습니다.</p><span>SEED {state.config.seed} · BEST PITCHER SAVE V1</span></div><button className="bp-text-button" onClick={onMenu}>← 시작 화면으로</button><input className="bp-hidden" ref={inputRef} type="file" accept=".json,application/json" onChange={(event) => { if (event.target.files?.[0]) onImport(event.target.files[0]); event.target.value = ""; }} />
  </section>;
}

export default function PitcherApp() {
  const [state, setState] = useState<PitcherState | null>(null);
  const [tab, setTab] = useState<Tab>("game");
  const [toast, setToast] = useState("");
  const [saveError, setSaveError] = useState("");
  useEffect(() => { if (!state) return; try { savePitcherGame(state); setSaveError(""); } catch { setSaveError("브라우저 자동 저장을 사용할 수 없습니다."); } }, [state]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 5000); return () => window.clearTimeout(timer); }, [toast]);
  const perform = (action: () => PitcherState) => { try { setState(action()); } catch (error) { setToast(error instanceof Error ? error.message : "진행하지 못했습니다."); } };
  const importJson = async (file: File) => {
    try { const loaded = parsePitcherSave(await file.text()); setState(loaded); setTab("game"); setToast("세이브를 불러왔습니다."); } catch (error) { setToast(error instanceof Error ? error.message : "세이브를 불러오지 못했습니다."); }
  };
  const load = () => { try { const loaded = loadPitcherGame(); if (loaded) { setState(loaded); setTab("game"); } } catch (error) { setToast(error instanceof Error ? error.message : "저장을 불러오지 못했습니다."); } };
  const toastElement = toast ? <div className="bp-toast" role="status">{toast}</div> : null;
  if (!state) return <><Setup onStart={(config, dataset) => perform(() => createPitcherCareer(config, dataset))} onLoad={load} onImport={importJson} />{toastElement}</>;
  const totalGames = state.config.league === "KBO" ? 144 : 162;
  const record = state.records[state.config.teamId];
  const nav = (mobile = false) => <nav className={mobile ? "bp-mobile-nav" : "bp-nav"} aria-label={mobile ? "모바일 메뉴" : "게임 메뉴"}>{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><i>{item.symbol}</i><span>{item.label}</span>{!mobile && tab === item.id && <b />}</button>)}</nav>;
  return <div className="bp-app-shell"><aside className="bp-sidebar"><Brand compact />{nav()}<div className="bp-sidebar-season"><span className="bp-eyebrow">{state.seasonComplete ? "SEASON COMPLETE" : "REGULAR SEASON"}</span><strong>{state.year} <small>{state.config.league}</small></strong><div className="bp-season-progress"><i style={{ width: `${record.games / totalGames * 100}%` }} /></div><p>{record.games} / {totalGames} 팀 경기 <span>{state.stats.starts} GS</span></p></div><div className="bp-sidebar-footer"><span>STARTER CAREER SIMULATION</span><button onClick={() => { setState(null); setTab("game"); }}>← 시작 화면</button></div></aside>
    <main className="bp-content"><header className="bp-topbar"><div><span className="bp-mobile-brand">BP.</span><strong>{tabs.find((item) => item.id === tab)?.label}</strong><span className="bp-top-divider" /><span>{state.config.league} · {state.year}</span></div><div><span>{state.dataset.teams[state.config.teamId].shortName}</span><strong>{record.wins}–{record.losses}{record.ties ? `–${record.ties}` : ""}</strong><span className={`bp-autosave ${saveError ? "error" : ""}`}><i />{saveError ? "저장 확인 필요" : "자동 저장"}</span></div></header>
      {saveError && <div className="bp-global-save-error" role="alert">{saveError} 저장 메뉴에서 JSON으로 기록을 보관해 주세요.</div>}
      <div className="bp-content-inner">{tab === "game" && <GamePage state={state} onChoice={(choice) => perform(() => applyPitchChoice(state, choice))} onRelieve={() => perform(() => relievePitcher(state))} onNext={(interval) => perform(() => nextPitcherStart(state, interval))} onNextSeason={(target, dataset) => perform(() => nextPitcherSeason(state, target, dataset))} />}{tab === "schedule" && <SchedulePage state={state} />}{tab === "standings" && <StandingsPage state={state} />}{tab === "rankings" && <PitcherRankingsPage state={state} />}{tab === "records" && <RecordsPage state={state} />}{tab === "save" && <SavePage state={state} saveError={saveError} onImport={importJson} onMenu={() => { setState(null); setTab("game"); }} onSave={() => { try { savePitcherGame(state); setSaveError(""); setToast("현재 커리어를 저장했습니다."); } catch { setSaveError("브라우저 자동 저장을 사용할 수 없습니다."); } }} />}</div>
    </main>{nav(true)}<PitcherCelebration state={state} />{toastElement}
  </div>;
}
