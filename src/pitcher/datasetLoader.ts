import { normalizePitcherDataset } from "./dataNormalization";
import type { RawDataset } from "./dataNormalization";
import type { League, PitcherDataset } from "./types";

export interface PitcherDatasetOption { id: string; league: League; year: number }
const kboFiles = import.meta.glob<{ default: RawDataset }>("../data/seasons/*.json");
const mlbFiles = import.meta.glob<{ default: RawDataset }>("../../_mlb/src/data/seasons/*.json");
const loaders = new Map<string, () => Promise<PitcherDataset>>();
const options: PitcherDatasetOption[] = [];
const cache = new Map<string, Promise<PitcherDataset>>();

for (const [league, files] of [["KBO", kboFiles], ["MLB", mlbFiles]] as const) {
  for (const [path, read] of Object.entries(files)) {
    const filename = path.split("/").pop()!;
    const year = Number(filename.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1]);
    if (!year) continue;
    const id = `${league}:${filename}`;
    options.push({ id, league, year });
    loaders.set(id, async () => {
      const module = await read();
      const raw = { ...module.default, sourceSeason: year };
      const count = league === "KBO" ? 10 : 30;
      if (Object.keys(raw.teams).length !== count || Object.values(raw.teams).some((team) => team.hitters.length < 9 || !team.pitchers.some((pitcher) => pitcher.role === "SP"))) throw new Error(`${league} 시즌의 선수 데이터를 읽지 못했습니다.`);
      return normalizePitcherDataset(raw, id, league);
    });
  }
}
options.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));

export const pitcherDatasetOptionsFor = (league: League) => options.filter((option) => option.league === league);
export function defaultPitcherDatasetOption(league: League): PitcherDatasetOption {
  const option = pitcherDatasetOptionsFor(league)[0];
  if (!option) throw new Error(`${league} 시즌 데이터가 없습니다.`);
  return option;
}

/** Only fetch and normalize the chosen season; revisiting it reuses the same data. */
export function loadPitcherDataset(id: string): Promise<PitcherDataset> {
  const read = loaders.get(id);
  if (!read) return Promise.reject(new Error("선택한 시즌 데이터가 없습니다."));
  let pending = cache.get(id);
  if (!pending) {
    pending = read().catch((error: unknown) => { cache.delete(id); throw error; });
    cache.set(id, pending);
  }
  return pending;
}
