import { validateSeasonDataset } from "../data/leagueDataset";
import type { LeagueDatasetEntry } from "../data/leagueDataset";

// 커리어 저장 및 다른 리그의 목록과 분리합니다.
export const SEASON_LIBRARY_KEY = "mlb-season-library-v1";

export function loadSeasonLibrary(): LeagueDatasetEntry[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(SEASON_LIBRARY_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { version?: number; entries?: LeagueDatasetEntry[] };
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error("시즌 JSON 목록을 읽을 수 없습니다. 기존 저장 목록은 변경하지 않았습니다.");
  const ids = new Set<string>();
  return parsed.entries.map(entry => {
    if (!entry || typeof entry.filename !== "string" || typeof entry.id !== "string" || !entry.id.startsWith("custom:") || ids.has(entry.id)) throw new Error("시즌 JSON 목록에 잘못된 항목이 있습니다.");
    ids.add(entry.id);
    return { ...entry, dataset: validateSeasonDataset(entry.dataset, entry.filename) };
  });
}

export function saveSeasonLibrary(entries: LeagueDatasetEntry[]): void {
  // 손상된 기존 목록은 새로운 목록으로 덮어쓰지 않습니다.
  loadSeasonLibrary();
  try {
    localStorage.setItem(SEASON_LIBRARY_KEY, JSON.stringify({ version: 1, entries }));
  } catch {
    throw new Error("브라우저에 JSON 목록을 저장하지 못했습니다. 저장 용량 또는 브라우저 설정을 확인해 주세요. 이번 선택은 가능하지만 새로고침 뒤에는 다시 가져와야 합니다.");
  }
}

export function upsertSeasonEntry(entries: LeagueDatasetEntry[], entry: LeagueDatasetEntry): LeagueDatasetEntry[] {
  return [...entries.filter(current => current.id !== entry.id), entry];
}
