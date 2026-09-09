import { avg, formatRate, formatWalks, obp, ops, slg, totalBases, walksLabel } from "../engine/statistics";
import type { BatterStats } from "../engine/types";

export interface BattingRecordRow {
  id: string;
  label: string;
  games: number;
  stats?: BatterStats;
  note?: string;
  current?: boolean;
}

export function BattingRecordTable({ rows }: { rows: BattingRecordRow[] }) {
  return <><p className="record-scroll-hint">표를 좌우로 밀어 루타·볼넷 등 전체 기록을 확인하세요.</p><div className="table-wrap" tabIndex={0} role="region" aria-label="타격 기록 표 · 좌우 스크롤"><table className="batting-record-table">
    <thead><tr><th>구분</th><th>경기</th><th>타석</th><th>타수</th><th>안타</th><th>2루타</th><th>3루타</th><th>홈런</th><th>루타</th><th>{walksLabel}</th><th>희생플라이</th><th>희생번트</th><th>타점</th><th>득점</th><th>도루</th><th>타율</th><th>출루율</th><th>장타율</th><th>OPS</th><th>비고</th></tr></thead>
    <tbody>{rows.map((row) => {
      const s = row.stats;
      const values = s ? [s.pa, s.ab, s.h, s.doubles, s.triples, s.hr, totalBases(s), formatWalks(s), s.sf, s.sh ?? 0, s.rbi, s.runs, s.sb, formatRate(avg(s)), formatRate(obp(s)), formatRate(slg(s)), formatRate(ops(s))] : Array.from({ length: 17 }, () => "—");
      return <tr key={row.id} className={row.current ? "user-row" : ""}>
        <td><b>{row.label}</b></td><td>{row.games}</td>{values.map((value, index) => <td key={index}>{value}</td>)}<td>{row.note ?? ""}</td>
      </tr>;
    })}</tbody>
  </table></div></>;
}
