import { useRef, useState } from "react";
import { getBuiltInLeagueDataset } from "../data/leagueDataset";
import type { LeagueDataset, SeasonGoals, SeasonState } from "../engine/types";
import { importLeagueData } from "../store/gameStore";
import { postseasonBattingBySeries, postseasonStageLabel } from "../engine/postseason";
import { SeasonStatGrid, TodayLine } from "./StatLine";

export function GameEnd({ state, onNext, onNavigate }: { state: SeasonState; onNext: (settings?: SeasonGoals, dataset?: LeagueDataset) => void; onNavigate: (tab: string) => void }) {
  const game = state.game!;
  const summary = game.summary!;
  const record = state.teamRecords[state.config.userTeam];
  const seasonEnd = game.phase === "SEASON_END";
  const regularSeasonComplete = state.progress === "POSTSEASON" && game.competition === "REGULAR_SEASON";
  const postseasonGame = game.competition !== "REGULAR_SEASON";
  const userPlayed = game.fixture.away === state.config.userTeam || game.fixture.home === state.config.userTeam;
  const seriesStats = postseasonBattingBySeries(state).find((row) => row.stage === game.competition);
  const series = state.postseason && (state.postseason.series.stage === game.competition
    ? state.postseason.series
    : [...state.postseason.completedSeries].reverse().find((item) => item.stage === game.competition));
  const otherResults = state.lastResults.filter((result) => !(result.away === summary.away && result.home === summary.home));
  const retired = state.career.status === "RETIRED";
  const nextSeason = state.season + 1;
  const builtInNextDataset = getBuiltInLeagueDataset(nextSeason);
  const dataInputRef = useRef<HTMLInputElement>(null);
  const [nextDataset, setNextDataset] = useState<LeagueDataset>(() => structuredClone(builtInNextDataset ?? state.leagueData));
  const [dataMessage, setDataMessage] = useState(builtInNextDataset ? `${nextSeason}년 내장 JSON 자동 선택` : `${nextSeason}년 내장 JSON 없음 · 현재 데이터 유지`);
  const [nextGoals, setNextGoals] = useState<SeasonGoals>({
    battingOrder: state.config.battingOrder,
    targetAvgMin: state.config.targetAvgMin,
    targetAvgMax: state.config.targetAvgMax,
    homeRunCap: state.config.homeRunCap,
    enforceHomeRunCap: state.config.enforceHomeRunCap,
    isFinalSeason: false,
  });
  const update = <K extends keyof SeasonGoals>(key: K, value: SeasonGoals[K]) => setNextGoals((current) => ({ ...current, [key]: value }));
  return (
    <section className="card game-end">
      <span className="eyebrow">{retired ? "CAREER COMPLETE" : seasonEnd ? "POSTSEASON COMPLETE" : regularSeasonComplete ? "REGULAR SEASON COMPLETE" : postseasonGame ? postseasonStageLabel[game.competition] : "GAME FINAL"}</span>
      <h1>{retired ? `${state.config.playerName}, 은퇴` : seasonEnd ? `${state.season} 시즌 종료` : regularSeasonComplete ? "정규시즌 종료" : postseasonGame ? `${postseasonStageLabel[game.competition]} ${game.fixture.gameInSeries}차전 종료` : "경기 종료"}</h1>
      <div className="final-score"><div><span>{state.leagueData.teams[summary.away].name}</span><strong>{summary.awayScore}</strong></div><b>FINAL</b><div><span>{state.leagueData.teams[summary.home].name}</span><strong>{summary.homeScore}</strong></div></div>
      <div className="decisions"><span>승리투수 <strong>{summary.winningPitcher}</strong></span><span>패전투수 <strong>{summary.losingPitcher}</strong></span>{summary.savePitcher && <span>세이브 <strong>{summary.savePitcher}</strong></span>}</div>
      {otherResults.length > 0 && <section className="other-ballparks"><header><div><span className="eyebrow">AROUND THE LEAGUE</span><h2>타구장 소식</h2></div></header><div>{otherResults.map((result) => <article key={`${result.away}-${result.home}`}><div><span>{state.leagueData.teams[result.away].shortName}</span><strong>{result.awayScore}</strong><b>–</b><strong>{result.homeScore}</strong><span>{state.leagueData.teams[result.home].shortName}</span></div><small>{result.awayScore === result.homeScore ? "무승부" : `승 ${result.winningPitcher} · 패 ${result.losingPitcher}${result.savePitcher ? ` · 세 ${result.savePitcher}` : ""}`}</small></article>)}</div></section>}
      {series && <p className="career-transition">{state.leagueData.teams[series.higherSeed].shortName} {(series.wins[series.higherSeed] ?? 0)}승 · {state.leagueData.teams[series.lowerSeed].shortName} {(series.wins[series.lowerSeed] ?? 0)}승{series.ties ? ` · ${series.ties}무` : ""}</p>}
      <div className="end-player">{userPlayed && <div><small>{state.config.playerName} 오늘</small><TodayLine stats={game.userGameStats} /></div>}<div><small>{state.leagueData.teams[state.config.userTeam].shortName} 정규시즌</small><strong>{record.wins}승 {record.losses}패 {record.ties}무</strong></div></div>
      {postseasonGame && userPlayed && seriesStats && <div className="series-stat-block"><h3>{postseasonStageLabel[seriesStats.stage]} 누적</h3>{seriesStats.complete ? <SeasonStatGrid stats={seriesStats.playerStats} /> : <p className="data-note">이전 세이브에 경기별 기록이 없어 이번 시리즈 합계를 복원할 수 없습니다.</p>}</div>}
      {seasonEnd && <p className="career-transition">{retired ? `${state.career.debutYear}–${state.season}, ${state.career.seasons.length}시즌의 커리어가 완료되었습니다.` : `다음은 ${state.season + 1} 시즌입니다. 새 목표와 마지막 시즌 여부를 정해 주세요.`}</p>}
      {seasonEnd && !retired && <div className="offseason-setup">
        <div className="offseason-title"><span>{state.season + 1} SEASON SETUP</span><strong>새 시즌 타순과 목표</strong></div>
        <div className="league-data-box offseason-data"><div><strong>다음 시즌 리그 데이터</strong><span>{dataMessage} · {nextDataset.label}</span></div><div><button type="button" onClick={() => { setNextDataset(structuredClone(state.leagueData)); setDataMessage("현재 시즌 데이터 유지"); }}>현재 데이터 유지</button><button type="button" onClick={() => dataInputRef.current?.click()}>JSON 가져오기</button></div></div>
        <div className="offseason-fields"><label><span>타순</span><select value={nextGoals.battingOrder} onChange={(event) => update("battingOrder", Number(event.target.value))}>{Array.from({ length: 9 }, (_, index) => <option value={index + 1} key={index}>{index + 1}번</option>)}</select></label><label><span>목표 타율 하한</span><input type="number" min="0" max="1" step="0.001" value={nextGoals.targetAvgMin} onChange={(event) => update("targetAvgMin", Number(event.target.value))} /></label><label><span>목표 타율 상한</span><input type="number" min="0" max="1" step="0.001" value={nextGoals.targetAvgMax} onChange={(event) => update("targetAvgMax", Number(event.target.value))} /></label><label><span>홈런 목표/최대</span><input type="number" min="0" value={nextGoals.homeRunCap} onChange={(event) => update("homeRunCap", Number(event.target.value))} /></label></div>
        <div className="offseason-checks"><label><input type="checkbox" checked={nextGoals.enforceHomeRunCap} onChange={(event) => update("enforceHomeRunCap", event.target.checked)} /> 홈런 수 도달 시 HR 선택 제한</label><label className="final-season-check"><input type="checkbox" checked={nextGoals.isFinalSeason} onChange={(event) => update("isFinalSeason", event.target.checked)} /> {state.season + 1} 시즌을 마지막으로 은퇴</label></div>
        <button className="primary-button" onClick={() => onNext(nextGoals, nextDataset)}>{state.season + 1} 시즌 시작</button>
        <input className="hidden-input" ref={dataInputRef} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void importLeagueData(file).then((dataset) => { setNextDataset(dataset); setDataMessage(`${dataset.sourceSeason ?? nextSeason}년 JSON 불러오기 완료`); }).catch((error: unknown) => setDataMessage(error instanceof Error ? error.message : "리그 데이터를 읽지 못했습니다.")); event.target.value = ""; }} />
      </div>}
      <div className="end-actions">{!seasonEnd && <button className="primary-button" onClick={() => onNext()}>{regularSeasonComplete ? "포스트시즌 진행" : postseasonGame ? "다음 포스트시즌 경기" : "다음 경기"}</button>}<button className="ghost-button" onClick={() => onNavigate("standings")}>리그 순위</button><button className="ghost-button" onClick={() => onNavigate("leaders")}>개인 순위</button><button className="ghost-button" onClick={() => onNavigate("records")}>{retired ? "통산 기록" : "기록 보기"}</button></div>
    </section>
  );
}
