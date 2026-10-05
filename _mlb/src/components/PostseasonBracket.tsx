import { useMemo } from "react";
import { createPostseason, seriesWinner } from "../engine/postseason";
import type { SeasonState, TeamId } from "../engine/types";

export function PostseasonBracket({ state }: { state: SeasonState }) {
  const postseason = useMemo(() => state.postseason ?? createPostseason(state.teamRecords, {}, state.headToHead, state.regularResults), [state.postseason, state.teamRecords, state.headToHead, state.regularResults]);
  const matches = new Map([...postseason.completedSeries, postseason.series, ...postseason.pendingSeries].map(series => [series.id, series]));
  const preview = !state.postseason;
  const card = (id: string, x: number, y: number, heading: string, defaults: Array<TeamId | string>, seedNumbers?: number[]) => {
    const series = matches.get(id);
    const teams = series ? [series.higherSeed, series.lowerSeed] : defaults;
    const winner = series && seriesWinner(series);
    const current = !preview && !postseason.champion && postseason.series.id === id;
    return <g key={id} transform={`translate(${x},${y})`} className={`bracket-match ${current ? "live" : ""}`}>
      <title>{heading}: {teams.map(team => state.leagueData.teams[team as TeamId]?.name ?? team).join(" 대 ")}{series ? `, ${series.wins[series.higherSeed] ?? 0}승 대 ${series.wins[series.lowerSeed] ?? 0}승` : ""}</title>
      <rect width="214" height="112" rx="12" fill={current ? "#17352f" : "#111f2b"} stroke={current ? "#66e1ad" : "#344957"} />
      <text x="14" y="22" fill={current ? "#66e1ad" : "#91a9bc"} fontSize="11" fontWeight="700">{heading}{current ? " · 진행 중" : winner ? " · 확정" : ""}</text>
      {teams.map((team, i) => {
        const definition = state.leagueData.teams[team as TeamId];
        const seed = series ? (i === 0 ? series.higherSeedNumber : series.lowerSeedNumber) : seedNumbers?.[i];
        return <g key={`${id}-${i}`} transform={`translate(14,${47 + i * 36})`}>
          <circle cx="7" cy="-4" r="5" fill={definition ? definition.primary : "#516675"} />
          <text x="22" y="0" fill={winner === team ? "#f1be73" : definition ? "#eff6fc" : "#8297a7"} fontSize="14" fontWeight={winner === team ? "800" : "500"}>{seed ? `#${seed} ` : ""}{definition?.shortName ?? team}{team === state.config.userTeam ? " ★" : ""}</text>
          {series && <text x="183" y="0" textAnchor="end" fill={winner === team ? "#f1be73" : "#eff6fc"} fontSize="19" fontWeight="800">{series.wins[team as TeamId] ?? 0}</text>}
        </g>;
      })}
    </g>;
  };
  const leagueCards = (league: "AL" | "NL", y: number) => {
    const seeds = postseason.leagueSeeds[league];
    const won = (id: string, fallback: string) => { const series = matches.get(id); return series && seriesWinner(series) || fallback; };
    return <g key={league}>
      <text x="20" y={y - 19} fill={league === "AL" ? "#77b7f1" : "#f1be73"} fontSize="16" fontWeight="800">{league === "AL" ? "AMERICAN LEAGUE" : "NATIONAL LEAGUE"}</text>
      {card(`${league}-WC45`, 20, y, `${league} WILD CARD · 2승`, [seeds[3], seeds[4]], [4,5])}
      {card(`${league}-WC36`, 20, y + 152, `${league} WILD CARD · 2승`, [seeds[2], seeds[5]], [3,6])}
      {card(`${league}-DS1`, 296, y, `${league} DIVISION · 3승`, [seeds[0], won(`${league}-WC45`, "4/5 시드 승자")], [1,0])}
      {card(`${league}-DS2`, 296, y + 152, `${league} DIVISION · 3승`, [seeds[1], won(`${league}-WC36`, "3/6 시드 승자")], [2,0])}
      {card(`${league}-CS`, 572, y + 76, `${league} CHAMPIONSHIP · 4승`, [won(`${league}-DS1`, "DS 1 승자"), won(`${league}-DS2`, "DS 2 승자")])}
    </g>;
  };
  const connectors = (y: number) => <g fill="none" stroke="#3e586b" strokeWidth="2"><path d={`M234 ${y+56} H296 M234 ${y+208} H296 M510 ${y+56} H540 V${y+132} H572 M510 ${y+208} H540 V${y+132}`} /></g>;
  return <section className="card bracket-card">
    <header className="section-header"><div><span className="eyebrow">ROAD TO THE WORLD SERIES</span><h2>{preview ? "현재 순위 기준 예상 대진표" : `${state.season} 포스트시즌 대진표`}</h2></div><span className="bracket-badge">12 TEAMS · 1 CHAMPION</span></header>
    <p className="bracket-help">{preview ? "시즌 종료 시 진출 팀이 확정됩니다. " : ""}각 리그 1·2번 시드는 디비전시리즈 직행 · 대진 재배치 없음 · ★ 내 팀<span>작은 화면에서는 대진표를 좌우로 밀어 보세요.</span></p>
    <div className="bracket-scroll" tabIndex={0} role="region" aria-label="가로 스크롤 가능한 MLB 토너먼트 대진표">
      <svg className="bracket-svg" viewBox="0 0 1110 780" role="img" aria-labelledby="bracket-title bracket-description">
        <title id="bracket-title">MLB 12팀 포스트시즌 토너먼트 대진표</title>
        <desc id="bracket-description">AL과 NL 각 6개 팀. 4·5번 시드 승자는 1번 시드, 3·6번 시드 승자는 2번 시드와 대결합니다. 양 리그 우승팀은 월드시리즈에서 만납니다.</desc>
        {connectors(74)}{connectors(452)}
        <path d="M786 206 H818 V395 H864 M786 584 H818 V395" fill="none" stroke="#a47c47" strokeWidth="2" />
        {leagueCards("AL",74)}{leagueCards("NL",452)}
        <text x="864" y="308" fill="#f1be73" fontSize="16" fontWeight="800">WORLD SERIES</text>
        {card("WS",864,339,"WORLD SERIES · 4승",["AL 챔피언", "NL 챔피언"])}
        {postseason.champion && <><text x="971" y="490" textAnchor="middle" fill="#f1be73" fontSize="13">WORLD CHAMPION</text><text x="971" y="523" textAnchor="middle" fill="#fff1d8" fontSize="28" fontWeight="900">{state.leagueData.teams[postseason.champion].shortName}</text></>}
      </svg>
    </div>
    <p className="bracket-help">WC: 3전 2선승 · DS: 5전 3선승 · CS/WS: 7전 4선승. 승수는 완료한 경기마다 갱신됩니다.</p>
  </section>;
}
