import type { HitterProfile, PitcherProfile } from "../engine/types";

export type League = "KBO" | "MLB";
export type PitchChoice = "OUT" | "1B" | "2B" | "3B" | "HR" | "BB" | "IBB" | "HBP" | "K" | "SH" | "SB" | "WP" | "CS";
export type StartInterval = 3 | 4 | 5;
export type Half = "TOP" | "BOTTOM";
export interface PitcherHitter extends Omit<HitterProfile, "bats"> { bats: "L" | "R" | "S" }

export interface PitcherTeam {
  id: string;
  name: string;
  shortName: string;
  primary: string;
  strength: number;
  hitters: PitcherHitter[];
  pitchers: PitcherProfile[];
  league?: string;
  division?: string;
}

export interface PitcherDataset {
  id: string;
  league: League;
  year: number;
  label: string;
  teams: Record<string, PitcherTeam>;
}

export interface PitcherConfig {
  league: League;
  dataId: string;
  playerName: string;
  teamId: string;
  throws: "L" | "R";
  debutYear: number;
  rotationSlot: number;
  targetEra: number;
  seed: number;
}

export interface PitchingStats {
  games: number;
  starts: number;
  wins: number;
  losses: number;
  outs: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  intentionalWalks: number;
  hitByPitch: number;
  strikeouts: number;
  sacrificeBunts: number;
  stolenBases: number;
  wildPitches: number;
  battersFaced: number;
  pitches: number;
  completeGames: number;
  shutouts: number;
  noHitters: number;
  perfectGames: number;
  qualityStarts: number;
  qualityStartsPlus: number;
  noHitNoRuns: number;
}

export interface Fixture {
  id: string;
  day: number;
  home: string;
  away: string;
  date?: string;
}

export interface Runner {
  id: string;
  name: string;
  responsibleUser: boolean;
  earned: boolean;
  pitcherKey?: string;
}

export interface PitcherGameLine {
  teamId: string;
  pitcherId: string;
  stats: PitchingStats;
}

export interface PitchingLedger {
  active: Record<string, string>;
  lines: Record<string, PitcherGameLine>;
}

export interface PitchLog {
  id: number;
  inning: number;
  half: Half;
  text: string;
  kind: "choice" | "auto" | "system";
  important?: boolean;
  outcome?: PitchChoice;
  teamId?: string;
  runsScored?: number;
}

export interface PitchGame {
  fixture: Fixture;
  inning: number;
  half: Half;
  outs: number;
  bases: [Runner | null, Runner | null, Runner | null];
  score: Record<string, number>;
  hits: Record<string, number>;
  lineScore: Record<string, number[]>;
  battingIndex: Record<string, number>;
  stats: PitchingStats;
  userActive: boolean;
  userWinEligible: boolean;
  controlled: boolean;
  phase: "PITCHING" | "FINISHED";
  decision: "W" | "L" | "ND";
  goAhead?: { team: string; winUser: boolean; lossUser: boolean; winnerKey?: string; loserKey?: string };
  pitching?: PitchingLedger;
  exit?: { inning: number; half: Half; outs: number; pitches: number; score: string };
  log: PitchLog[];
  nextLogId: number;
  focusLogId?: number;
  streaks: { strikeouts: number; outBatters: number };
}

export interface TeamRecord {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  runsFor: number;
  runsAgainst: number;
}

export interface PitchResult {
  fixture: Fixture;
  homeScore: number;
  awayScore: number;
  controlled: boolean;
  stats?: PitchingStats;
  decision?: PitchGame["decision"];
  pitching?: Record<string, PitcherGameLine>;
}

export interface SeasonHistory {
  year: number;
  league: League;
  teamName: string;
  targetEra: number;
  stats: PitchingStats;
  record: TeamRecord;
  detailedMilestonesKnown?: boolean;
}

export interface PitcherState {
  schemaVersion: 1;
  gameType: "BEST_PITCHER";
  config: PitcherConfig;
  dataset: PitcherDataset;
  year: number;
  rngState: number;
  schedule: Fixture[];
  cursor: number;
  game: PitchGame | null;
  stats: PitchingStats;
  records: Record<string, TeamRecord>;
  results: PitchResult[];
  history: SeasonHistory[];
  seasonComplete: boolean;
  eraRestriction?: { remaining: number; cooldownFixtureId?: string };
  nextStartGameNumber: number;
  startInterval: StartInterval;
  leaguePitching: Record<string, PitchingStats>;
  leaguePitchingSinceGames: Record<string, number>;
}
