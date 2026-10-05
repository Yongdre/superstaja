import type { GameState, LeagueDataset, TeamId } from "../engine/types";

const inningLabel = (inning: number, half: "TOP" | "BOTTOM") => `${inning}회${half === "TOP" ? "초" : "말"}`;

function BaseDiamond({ game }: { game: GameState }) {
  return (
    <div className="diamond" aria-label="주자 상황">
      <span className={`base second ${game.bases[1] ? "occupied" : ""}`} title={game.bases[1]?.name ?? "2루 비어 있음"} />
      <span className={`base third ${game.bases[2] ? "occupied" : ""}`} title={game.bases[2]?.name ?? "3루 비어 있음"} />
      <span className={`base first ${game.bases[0] ? "occupied" : ""}`} title={game.bases[0]?.name ?? "1루 비어 있음"} />
      <span className="home-plate" />
    </div>
  );
}

function TeamScore({ id, score, side, dataset }: { id: TeamId; score: number; side: string; dataset: LeagueDataset }) {
  const team = dataset.teams[id];
  return (
    <div className="team-score">
      <span className="team-mark" style={{ background: team.primary, color: team.accent }}>{team.shortName.slice(0, 2)}</span>
      <div><small>{side}</small><strong>{team.shortName}</strong></div>
      <b>{score}</b>
    </div>
  );
}

export function Scoreboard({ game, dataset }: { game: GameState; dataset: LeagueDataset }) {
  return (
    <section className="scoreboard card">
      <div className="score-teams">
        <TeamScore id={game.fixture.away} score={game.score[game.fixture.away]} side="AWAY" dataset={dataset} />
        <div className="score-divider" />
        <TeamScore id={game.fixture.home} score={game.score[game.fixture.home]} side="HOME" dataset={dataset} />
      </div>
      <div className="situation">
        <div><span className="live-dot" /> <strong>{game.phase === "GAME_END_TRANSITION" || game.phase === "GAME_END" || game.phase === "SEASON_END" ? "FINAL" : inningLabel(game.inning, game.half)}</strong></div>
        <div className="outs" aria-label={`${game.outs} 아웃`}>
          {[0, 1].map((out) => <i className={game.outs > out ? "on" : ""} key={out} />)}<span>OUT</span>
        </div>
        <BaseDiamond game={game} />
      </div>
    </section>
  );
}
