import type { SeasonState } from "../engine/types";

export function CareerMilestones({ state }: { state: SeasonState }) {
  const records = state.career.milestones ?? [];
  return (
    <section className="card full-width">
      <header className="section-header"><div><span className="eyebrow">CAREER MILESTONES</span><h2>통산 기록 달성</h2></div><small>정규시즌 기준</small></header>
      {records.length > 0 ? <div className="career-milestone-list">{[...records].reverse().map(record => (
        <article key={`${record.stat}:${record.value}`}>
          <strong>통산 {record.value.toLocaleString("ko-KR")}{record.stat === "h" ? "안타" : "홈런"} 달성!</strong>
          <span>{record.date ?? `${record.season}년`} · {record.gameNumber}차전 · {record.inning}회{record.half === "TOP" ? "초" : "말"} · vs {record.opponentName}</span>
        </article>
      ))}</div> : <p className="data-note">통산 1,000안타·100홈런마다 달성 경기와 상대 팀을 남깁니다.</p>}
    </section>
  );
}

