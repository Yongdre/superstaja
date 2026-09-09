import { validateSave } from "../engine/gameEngine";
import { validateLeagueDataset } from "../data/leagueDataset";
import type { LeagueDataset, SeasonState } from "../engine/types";

const SAVE_KEY = "kbo-sim-save-v1";
export const manualSaveSlots = [1, 2, 3] as const;
export type ManualSaveSlot = (typeof manualSaveSlots)[number];

interface ManualSaveEnvelope {
  version: 1;
  savedAt: string;
  state: SeasonState;
}

export interface ManualSaveSlotSummary {
  slot: ManualSaveSlot;
  status: "EMPTY" | "READY" | "INVALID";
  savedAt?: string;
  playerName?: string;
  season?: number;
  games?: number;
}

const manualSaveKey = (slot: ManualSaveSlot) => `kbo-sim-manual-save-${slot}`;

export function serializeManualSave(state: SeasonState, savedAt = new Date().toISOString()) {
  const envelope: ManualSaveEnvelope = { version: 1, savedAt, state };
  return JSON.stringify(envelope);
}

export function parseManualSave(raw: string): { savedAt?: string; state: SeasonState } {
  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === "object" && "state" in parsed) {
    const envelope = parsed as Partial<ManualSaveEnvelope>;
    return {
      savedAt: typeof envelope.savedAt === "string" ? envelope.savedAt : undefined,
      state: validateSave(envelope.state),
    };
  }
  return { state: validateSave(parsed) };
}

export function saveGame(state: SeasonState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame(): SeasonState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  return validateSave(JSON.parse(raw));
}

export function hasSavedGame() {
  return Boolean(localStorage.getItem(SAVE_KEY));
}

export function saveGameToSlot(slot: ManualSaveSlot, state: SeasonState) {
  localStorage.setItem(manualSaveKey(slot), serializeManualSave(state));
}

export function loadGameFromSlot(slot: ManualSaveSlot): SeasonState | null {
  const raw = localStorage.getItem(manualSaveKey(slot));
  return raw ? parseManualSave(raw).state : null;
}

export function getManualSaveSlotSummary(slot: ManualSaveSlot): ManualSaveSlotSummary {
  const raw = localStorage.getItem(manualSaveKey(slot));
  if (!raw) return { slot, status: "EMPTY" };
  try {
    const { savedAt, state } = parseManualSave(raw);
    return {
      slot,
      status: "READY",
      savedAt,
      playerName: state.config.playerName,
      season: state.season,
      games: state.teamRecords[state.config.userTeam].games,
    };
  } catch {
    return { slot, status: "INVALID" };
  }
}

export function exportGame(state: SeasonState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kbo-career-${state.season}-${state.config.playerName}-${state.teamRecords[state.config.userTeam].games}g.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importGame(file: File): Promise<SeasonState> {
  const raw = await file.text();
  return validateSave(JSON.parse(raw));
}

export function exportLeagueData(dataset: LeagueDataset, fileName?: string) {
  const clean = structuredClone(dataset);
  Object.values(clean.teams).forEach((team) => {
    team.hitters.forEach((hitter) => {
      if (!hitter.statProfile) return;
      delete (hitter as Partial<typeof hitter>).contact;
      delete (hitter as Partial<typeof hitter>).power;
      delete (hitter as Partial<typeof hitter>).discipline;
      delete (hitter as Partial<typeof hitter>).speed;
    });
    team.pitchers.forEach((pitcher) => {
      if (!pitcher.statProfile) return;
      delete (pitcher as Partial<typeof pitcher>).stuff;
      delete (pitcher as Partial<typeof pitcher>).movement;
      delete (pitcher as Partial<typeof pitcher>).control;
      delete (pitcher as Partial<typeof pitcher>).stamina;
    });
  });
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName ?? `kbo-league-data-${dataset.sourceSeason ?? "custom"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importLeagueData(file: File): Promise<LeagueDataset> {
  return validateLeagueDataset(JSON.parse(await file.text()));
}
