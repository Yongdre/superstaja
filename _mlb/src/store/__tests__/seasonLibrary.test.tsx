import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildLeagueCatalog, builtInLeagueEntries, builtInLeagueIssues, defaultLeagueDataset, getBuiltInLeagueDataset, seasonYearFromFilename, validateSeasonDataset } from "../../data/leagueDataset";
import { LeagueDataPicker, seasonOptions } from "../../components/LeagueDataPicker";
import { GameEnd } from "../../components/GameEnd";
import { careerSeasonsIncludingCurrent } from "../../engine/career";
import { applyUserChoice, createNewSeason, startNextSeason, validateSave } from "../../engine/gameEngine";
import { loadSeasonLibrary, saveSeasonLibrary, SEASON_LIBRARY_KEY, upsertSeasonEntry } from "../seasonLibrary";

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  return values;
}
function entry(year: number, filename = year + ".json") {
  return { id: "custom:" + filename, filename, dataset: { ...structuredClone(defaultLeagueDataset), sourceSeason: year, label: year + " 테스트 데이터" } };
}
afterEach(() => vi.unstubAllGlobals());

describe("모든 시즌 JSON 등록", () => {
  it("파일명에서 연도만 추출하고 잘못된 내부 연도를 복사본에서 보완한다", () => {
    expect(seasonYearFromFilename("2025-mlbdata-ver1-5woBOS.json")).toBe(2025);
    expect(seasonYearFromFilename("2018-data-ver2.json")).toBe(2018);
    expect(seasonYearFromFilename("template.json")).toBeUndefined();
    const raw = {...structuredClone(defaultLeagueDataset), sourceSeason: 2019};
    expect(validateSeasonDataset(raw, "2018-data-ver2.json").sourceSeason).toBe(2018);
    expect(raw.sourceSeason).toBe(2019);
  });
  it("같은 연도의 여러 파일도 서로 다른 선택 항목으로 유지한다", () => {
    const data = defaultLeagueDataset;
    const catalog = buildLeagueCatalog({ "./seasons/2017-season-data.json": {default: data}, "./seasons/alternate.json": {default: data}, "./seasons/broken.json": {default: {schemaVersion: 7}} });
    expect(catalog.entries).toHaveLength(2);
    expect(new Set(catalog.entries.map(item => item.id)).size).toBe(2);
    expect(catalog.issues).toHaveLength(1);
    expect(catalog.issues[0]).toContain("broken.json");
  });
  it("기존 기본 파일의 자동 선택을 유지한다", () => {
    expect(getBuiltInLeagueDataset(defaultLeagueDataset.sourceSeason!)?.label).toBe(defaultLeagueDataset.label);
    expect(builtInLeagueEntries.every(item => item.filename.endsWith(".json"))).toBe(true);
    expect(builtInLeagueEntries.length).toBeGreaterThan(0);
    expect(builtInLeagueIssues).toEqual([]);
  });
  it("연도순으로 정리하고 저장 속 현재 데이터도 선택 목록에 표시한다", () => {
    const current = entry(2099).dataset;
    const list = seasonOptions([entry(2035), entry(2018)], current);
    expect(list.map(item => item.dataset.sourceSeason).filter(year => year !== 2099)).toEqual(list.map(item => item.dataset.sourceSeason).filter(year => year !== 2099).sort((a,b) => a! - b!));
    expect(list.at(-1)?.id).toBe("current");
    expect(seasonOptions([entry(2099)], current).some(item => item.id === "current")).toBe(false);
  });
});

describe("브라우저에 추가한 시즌 목록", () => {
  it("다시 읽은 목록에 여러 연도 데이터가 유지되고 커리어 세이브를 건드리지 않는다", () => {
    const values = storage();
    values.set("existing-save", "keep");
    saveSeasonLibrary([entry(2018), entry(2035)]);
    expect(loadSeasonLibrary().map(item => item.dataset.sourceSeason)).toEqual([2018,2035]);
    expect(values.get("existing-save")).toBe("keep");
  });
  it("같은 파일 재업로드는 그 파일만 교체하고 다른 버전은 보존한다", () => {
    const list = [entry(2017, "original.json"), entry(2017, "balanced.json")];
    const next = upsertSeasonEntry(list, {...list[0], dataset: {...list[0].dataset, label: "수정"}});
    expect(next).toHaveLength(2);
    expect(next.find(item => item.filename === "balanced.json")).toEqual(list[1]);
    expect(next.find(item => item.filename === "original.json")?.dataset.label).toBe("수정");
  });
  it("잘못된 기존 목록을 덮어쓰지 않는다", () => {
    const values = storage();
    values.set(SEASON_LIBRARY_KEY, '{"version":9}');
    expect(() => saveSeasonLibrary([entry(2018)])).toThrow();
    expect(values.get(SEASON_LIBRARY_KEY)).toBe('{"version":9}');
  });
  it("용량 부족이면 재추가 안내를 하고 기존 파일은 유지한다", () => {
    const values = storage();
    saveSeasonLibrary([entry(2018)]);
    const before = values.get(SEASON_LIBRARY_KEY);
    localStorage.setItem = () => { throw new Error("quota"); };
    expect(() => saveSeasonLibrary([entry(2019)])).toThrow("새로고침");
    expect(values.get(SEASON_LIBRARY_KEY)).toBe(before);
  });
});

describe("새 커리어와 다음 시즌 데이터 선택", () => {
  it("선택 목록에 연도만 표시하고 여러 파일을 받을 수 있다", () => {
    storage();
    saveSeasonLibrary([entry(2099, "fictional-2099.json")]);
    const html = renderToStaticMarkup(<LeagueDataPicker value={defaultLeagueDataset} onChange={() => {}} />);
    expect(html).toContain("데이터 기준 연도");
    expect(html).toContain(">2099년</option>");
    const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(match => match[1]);
    expect(labels.every(label => /^[0-9]{4}년$/.test(label))).toBe(true);
    expect(html).toContain('multiple=""');
  });
  it("잘못된 브라우저 목록이 있어도 내장 선택과 경고를 표시한다", () => {
    const values = storage();
    values.set(SEASON_LIBRARY_KEY, "bad json");
    const html = renderToStaticMarkup(<LeagueDataPicker value={defaultLeagueDataset} onChange={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(`>${defaultLeagueDataset.sourceSeason}년</option>`);
  });
  it("다음 시즌 준비에서도 현재 데이터와 다른 연도 데이터를 선택할 수 있다", () => {
    storage();
    saveSeasonLibrary([entry(2030)]);
    const state = createNewSeason({ debutYear: 2099, playerName: "검증" });
    state.game!.phase = "SEASON_END";
    state.game!.summary = {away: state.game!.fixture.away, home: state.game!.fixture.home, awayScore: 1, homeScore: 0, winningPitcher: "", losingPitcher: ""};
    const html = renderToStaticMarkup(<GameEnd state={state} onNext={() => {}} onNavigate={() => {}} />);
    expect(html).toContain(">2030년</option>");
    expect(html).toContain("2100 가상 시즌");
  });
  it("데이터 연도를 바꿔도 커리어 시즌 연도는 유지하고 세이브에 선택 데이터가 남는다", () => {
    const chosen = entry(2030).dataset;
    const state = createNewSeason({ debutYear: 2099 }, chosen);
    expect(state.season).toBe(2099);
    expect(state.leagueData.sourceSeason).toBe(2030);
    state.game!.phase = "SEASON_END";
    const next = startNextSeason(state, {...state.config}, entry(2018).dataset);
    expect(next.season).toBe(2100);
    expect(next.leagueData.sourceSeason).toBe(2018);
    const restored = validateSave(JSON.parse(JSON.stringify(next)));
    expect(restored.leagueData.label).toBe("2018 테스트 데이터");
    expect(careerSeasonsIncludingCurrent(restored).at(-1)).toMatchObject({dataSourceSeason: 2018, datasetLabel: "2018 테스트 데이터"});
  });
  it("등록한 모든 시즌 데이터로 게임을 시작하고 직접 타격할 수 있다", () => {
    for (const entry of builtInLeagueEntries) {
      const state = createNewSeason({debutYear: entry.dataset.sourceSeason}, entry.dataset);
      expect(state.game!.phase).toBe("USER_AT_BAT");
      expect(state.leagueData.sourceSeason).toBe(seasonYearFromFilename(entry.filename));
      const next = applyUserChoice(state, "OUT");
      expect(next.playerStats["USER-PLAYER"].pa).toBe(1);
      expect(next.leagueData).toEqual(entry.dataset);
    }
  });
});
