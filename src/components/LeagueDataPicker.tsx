import { useMemo, useRef, useState } from "react";
import { builtInLeagueEntries, builtInLeagueIssues, validateSeasonDataset } from "../data/leagueDataset";
import type { LeagueDatasetEntry } from "../data/leagueDataset";
import type { LeagueDataset } from "../engine/types";
import { loadSeasonLibrary, saveSeasonLibrary, upsertSeasonEntry } from "../store/seasonLibrary";

export function seasonOptionLabel(entry: LeagueDatasetEntry): string {
  return entry.dataset.sourceSeason !== undefined ? `${entry.dataset.sourceSeason}년` : "연도 미지정";
}

export function seasonOptions(imported: LeagueDatasetEntry[], current: LeagueDataset): LeagueDatasetEntry[] {
  const entries = [...builtInLeagueEntries, ...imported].sort((a, b) => (a.dataset.sourceSeason ?? 0) - (b.dataset.sourceSeason ?? 0) || a.filename.localeCompare(b.filename));
  const fingerprint = JSON.stringify(current);
  if (!entries.some(entry => JSON.stringify(entry.dataset) === fingerprint)) entries.push({ id: "current", filename: "현재 선택 데이터", dataset: current });
  return entries;
}

export function LeagueDataPicker({ value, onChange }: { value: LeagueDataset; onChange: (dataset: LeagueDataset, message: string) => void }) {
  const [library, setLibrary] = useState(() => {
    try { return { entries: loadSeasonLibrary(), error: "" }; }
    catch (error) { return { entries: [] as LeagueDatasetEntry[], error: error instanceof Error ? error.message : "시즌 JSON 목록을 읽지 못했습니다." }; }
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [chosenId, setChosenId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => seasonOptions(library.entries, value), [library.entries, value]);
  const fingerprint = JSON.stringify(value);
  const matches = entries.filter(entry => JSON.stringify(entry.dataset) === fingerprint);
  const selected = (matches.find(entry => entry.id === chosenId) ?? matches[0])?.id ?? "current";

  const importFiles = async (files: File[]) => {
    setBusy(true);
    let updated = library.entries;
    const accepted: LeagueDatasetEntry[] = [], errors: string[] = [];
    try {
      for (const file of files) {
        try {
          const entry = { id: "custom:" + file.name, filename: file.name, dataset: validateSeasonDataset(JSON.parse(await file.text()), file.name) };
          updated = upsertSeasonEntry(updated, entry);
          accepted.push(entry);
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : "파일을 읽지 못했습니다."}`);
        }
      }
      if (accepted.length) {
        let storageError = "";
        try { saveSeasonLibrary(updated); }
        catch (error) { storageError = error instanceof Error ? error.message : "브라우저 저장 실패"; }
        setLibrary({ entries: updated, error: storageError });
        setChosenId(accepted[0].id);
        const first = accepted[0].dataset;
        onChange(structuredClone(first), `${accepted.length}개 JSON 추가 · ${first.sourceSeason ?? "연도 미지정"} 데이터 선택`);
      }
      setMessage(errors.join(" / ") || (accepted.length ? `${accepted.length}개 추가 완료 · 목록에서 사용할 데이터를 선택하세요.` : "추가한 파일이 없습니다."));
    } finally {
      setBusy(false);
    }
  };

  return <div className="league-data-picker">
    <label><span>데이터 기준 연도</span><select aria-label="데이터 기준 연도" value={selected} onChange={event => {
      const entry = entries.find(item => item.id === event.target.value);
      if (entry) {
        setChosenId(entry.id);
        onChange(structuredClone(entry.dataset), `${entry.dataset.sourceSeason ?? "연도 미지정"}년 데이터 선택`);
      }
    }}>{entries.map(entry => <option key={entry.id} value={entry.id}>{seasonOptionLabel(entry)}</option>)}</select></label>
    <button type="button" className="ghost-button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "JSON 확인 중…" : "시즌 JSON 추가 (여러 파일 가능)"}</button>
    <small className="data-note">추가한 파일은 이 기기·브라우저에 보관됩니다. 진행 중인 시즌의 데이터는 세이브에도 포함됩니다.</small>
    {message && <p className="data-note" role="status">{message}</p>}
    {library.error && <p className="data-note" role="alert">{library.error}</p>}
    {builtInLeagueIssues.length > 0 && <p className="data-note" role="alert">등록하지 못한 내장 파일: {builtInLeagueIssues.join(" / ")}</p>}
    <input className="hidden-input" ref={inputRef} type="file" multiple accept="application/json,.json" onChange={event => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length) void importFiles(files);
    }} />
  </div>;
}
