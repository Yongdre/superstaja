import { avg, formatRate } from "../engine/statistics";
import { activePlayerStats } from "../engine/gameEngine";
import { canChooseSacrifice } from "../engine/plateAppearance";
import { getPitcherGrade } from "../engine/pitcherGrade";
import { postseasonBattingBySeries, postseasonStageLabel } from "../engine/postseason";
import { userFieldPositionLabels } from "../engine/types";
import type { SeasonState, UserChoice } from "../engine/types";
import { TodayLine, SeasonStatGrid } from "./StatLine";

const choices: Array<{ value: UserChoice; label: string; sub: string; className?: string }> = [
  { value: "OUT", label: "NO HIT", sub: "아웃 계열" },
  { value: "1B", label: "1B", sub: "안타" },
  { value: "2B", label: "2B", sub: "2루타" },
  { value: "3B", label: "3B", sub: "3루타" },
  { value: "HR", label: "HR", sub: "홈런", className: "power" },
  { value: "BB", label: "BB", sub: "볼넷" },
  { value: "HBP", label: "HBP", sub: "사구" },
  { value: "IBB", label: "IBB", sub: "고의사구" },
  { value: "SF", label: "SF", sub: "희생플라이" },
  { value: "SH", label: "SH", sub: "희생번트" },
];

export function BatterPanel({ state, onChoice, onSteal }: { state: SeasonState; onChoice: (choice: UserChoice) => void; onSteal: (attempt: boolean) => void }) {
  const game = state.game!;
  const postseason = game.competition !== "REGULAR_SEASON";
  const seasonStats = activePlayerStats(state)["USER-PLAYER"];
  const seriesStats = postseasonBattingBySeries(state).find((row) => row.stage === game.competition);
  const pitchingTeam = game.half === "TOP" ? game.fixture.home : game.fixture.away;
  const pitcher = game.pitchers[pitchingTeam];
  const pitcherProfile = state.leagueData.teams[pitchingTeam].pitchers.find((player) => player.id === pitcher.pitcherId);
  const pitcherGrade = pitcherProfile ? getPitcherGrade(pitcherProfile) : undefined;
  const isAtBat = game.phase === "USER_AT_BAT";
  const waitingSteal = game.phase === "WAITING_FOR_STEAL";
  const gameFinished = game.phase === "GAME_END_TRANSITION";
  const capReached = !postseason && state.config.enforceHomeRunCap && seasonStats.hr >= state.config.homeRunCap;
  const pace = state.teamRecords[state.config.userTeam].games ? Math.round(seasonStats.hr / state.teamRecords[state.config.userTeam].games * 144) : 0;

  return (
    <section className={`batter-panel card ${isAtBat || waitingSteal ? "active" : ""}`}>
      <div className="batter-heading">
        <div className="player-number">02</div>
        <div><span className="eyebrow">{gameFinished ? "GAME COMPLETE" : "NOW BATTING"}</span><h1>{state.config.playerName}</h1><p>{userFieldPositionLabels[state.config.position]} · {state.config.battingOrder}번 타자 · {state.leagueData.teams[state.config.userTeam].shortName}</p></div>
        <div className="pitcher-box"><span>{gameFinished ? "마지막 투수" : "상대 투수"}</span><div className="pitcher-identity"><strong>{pitcher.name}</strong>{pitcherGrade && <span className={`pitcher-grade grade-${pitcherGrade.toLowerCase()}`} aria-label={`투수 등급 ${pitcherGrade}`}>{pitcherGrade}등급</span>}</div><small>{pitcher.pitchCount}구 · {pitcher.runsAllowed}실점</small></div>
      </div>

      <div className="today-strip"><span>오늘</span><TodayLine stats={game.userGameStats} /></div>

      {isAtBat && <div className="decision-zone">
        <div className="decision-title"><div><span className="pulse" /><strong>결과를 선택하세요</strong></div><small>선택한 결과는 변경되지 않습니다</small></div>
        <div className="choice-grid">
          {choices.map((choice) => <button key={choice.value} className={`choice-button ${choice.className ?? ""}`} disabled={(choice.value === "HR" && capReached) || ((choice.value === "SF" || choice.value === "SH") && !canChooseSacrifice(game, choice.value))} onClick={() => onChoice(choice.value)}><strong>{choice.label}</strong><span>{choice.value === "HR" && capReached ? "한도 도달" : choice.sub}</span></button>)}
        </div>
        <p className="data-note">희생플라이: 0·1사 3루 주자 · 희생번트: 0·1사 1·2루 주자, 3루 비어 있음. 성공한 결과를 선택합니다.</p>
      </div>}

      {waitingSteal && <div className="steal-prompt">
        <div><span className="pulse" /><h3>도루를 시도하시겠습니까?</h3><p>성공률 {Math.round(state.config.stealSuccess * 100)}% · 투수·포수·주루 능력 보정 없이 매 시도 독립 판정합니다.</p></div>
        <div><button className="primary-button" onClick={() => onSteal(true)}>시도 · ㄱㄱ</button><button className="ghost-button" onClick={() => onSteal(false)}>하지 않음 · ㄴㄴ</button></div>
      </div>}

      <div className="season-heading"><div><span className="eyebrow">{postseason ? "POSTSEASON" : `${state.season} SEASON`}</span><h3>{postseason ? "포스트시즌 누적" : "시즌 누적"}</h3></div><div className="target-meter">{postseason ? <><span>목표 제한 없음</span><strong>현재 {formatRate(avg(seasonStats))}</strong><small>정규시즌과 별도 기록</small></> : <><span>목표 {formatRate(state.config.targetAvgMin)}–{formatRate(state.config.targetAvgMax)}</span><strong>현재 {formatRate(avg(seasonStats))}</strong><small>HR 페이스 {pace} / 최대 {state.config.homeRunCap}</small></>}</div></div>
      <SeasonStatGrid stats={seasonStats} />
      {postseason && seriesStats && <div className="series-stat-block"><h3>{postseasonStageLabel[seriesStats.stage]} 누적</h3>{seriesStats.complete ? <SeasonStatGrid stats={seriesStats.playerStats} /> : <p className="data-note">이전 세이브에 경기별 기록이 없어 이번 시리즈 합계를 복원할 수 없습니다.</p>}</div>}
    </section>
  );
}
