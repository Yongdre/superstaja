export type TeamId =
  | "KIA"
  | "DOO"
  | "LOT"
  | "NC"
  | "SK"
  | "LG"
  | "NEX"
  | "HAN"
  | "KT"
  | "SAM";

export type Half = "TOP" | "BOTTOM";
export type GamePhase = "USER_AT_BAT" | "WAITING_FOR_STEAL" | "SIMULATING" | "GAME_END_TRANSITION" | "GAME_END" | "SEASON_END";
export type UserChoice = "OUT" | "1B" | "2B" | "3B" | "HR" | "BB" | "HBP" | "IBB" | "SF" | "SH";
export type Handedness = "L" | "R";
export type FieldPosition = "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH";
export const userFieldPositions = ["LF", "CF", "RF", "1B", "2B", "3B", "SS", "C"] as const;
export type UserFieldPosition = (typeof userFieldPositions)[number];
export const userFieldPositionLabels: Record<UserFieldPosition, string> = {
  LF: "좌익수",
  CF: "중견수",
  RF: "우익수",
  "1B": "1루수",
  "2B": "2루수",
  "3B": "3루수",
  SS: "유격수",
  C: "포수",
};
export type AvailabilityPattern = "REGULAR" | "INJURY";
export type CompetitionStage = "REGULAR_SEASON" | "WILD_CARD" | "SEMI_PLAYOFF" | "PLAYOFF" | "KOREAN_SERIES";
export type SeasonProgress = "REGULAR_SEASON" | "POSTSEASON" | "SEASON_COMPLETE";

export interface HitterStatProfile {
  games: number;
  avg: number;
  homeRuns: number;
  /** 1–10. 5가 리그 평균인 선구안 입력값입니다. */
  eye?: number;
  /** 1–10. 5가 리그 평균인 주루 속도 입력값입니다. */
  speed?: number;
  plateAppearances?: number;
  atBats?: number;
  doubles?: number;
  triples?: number;
  walks?: number;
  strikeouts?: number;
  stolenBases?: number;
  caughtStealing?: number;
  onBasePct?: number;
}

export interface PitcherStatProfile {
  era: number;
  innings?: number;
  games?: number;
  gamesStarted?: number;
  strikeouts?: number;
  walks?: number;
  saves?: number;
}

export interface HitterProfile {
  id: string;
  name: string;
  position: string;
  bats: Handedness;
  contact: number;
  power: number;
  discipline: number;
  speed: number;
  statProfile?: HitterStatProfile;
  availability?: AvailabilityPattern;
  ratingOverrides?: Partial<{ contact: number; power: number; discipline: number; speed: number }>;
}

export const pitcherGrades = ["S", "A", "B", "C", "D"] as const;
export type PitcherGrade = typeof pitcherGrades[number];

export interface PitcherProfile {
  id: string;
  name: string;
  throws: Handedness;
  role: "SP" | "RP" | "CP";
  stuff: number;
  movement: number;
  control: number;
  stamina: number;
  /** 표시용 등급. 생략하면 구위·무브먼트·제구 평균으로 계산합니다. */
  grade?: PitcherGrade;
  statProfile?: PitcherStatProfile;
  ratingOverrides?: Partial<{ stuff: number; movement: number; control: number; stamina: number }>;
}

export interface TeamDefinition {
  id: TeamId;
  name: string;
  shortName: string;
  city: string;
  primary: string;
  accent: string;
  strength: number;
  hitters: HitterProfile[];
  pitchers: PitcherProfile[];
}

export interface BatterStats {
  pa: number;
  ab: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  runs: number;
  bb: number;
  ibb: number;
  hbp: number;
  sf: number;
  sh: number;
  so: number;
  sb: number;
  cs: number;
  gidp: number;
  roe: number;
}

export interface TeamRecord {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  runsFor: number;
  runsAgainst: number;
  homeGames: number;
  awayGames: number;
}

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface GameFixture {
  id: string;
  day: number;
  series: number;
  gameInSeries: number;
  seriesLength: number;
  away: TeamId;
  home: TeamId;
}

export interface DaySchedule {
  day: number;
  games: GameFixture[];
}

export interface Baserunner {
  playerId: string;
  name: string;
  teamId: TeamId;
  speed: number;
  isUser: boolean;
}

export interface PitcherGameState {
  pitcherId: string;
  name: string;
  pitchCount: number;
  runsAllowed: number;
  outsRecorded: number;
  battersFaced: number;
  bullpenIndex: number;
  isStarter: boolean;
}

export interface GameLogEntry {
  id: number;
  inning: number;
  half: Half;
  text: string;
  important: boolean;
}

export interface GameSummary {
  away: TeamId;
  home: TeamId;
  awayScore: number;
  homeScore: number;
  winningPitcher: string;
  losingPitcher: string;
  savePitcher?: string;
}

export interface PitcherDecisionCandidate {
  pitcherId: string;
  name: string;
}

export interface PitchingDecisionState {
  leadingTeam: TeamId;
  winningPitcher: PitcherDecisionCandidate;
  losingPitcher: PitcherDecisionCandidate;
}

export interface GameState {
  fixture: GameFixture;
  competition: CompetitionStage;
  inning: number;
  half: Half;
  outs: number;
  bases: [Baserunner | null, Baserunner | null, Baserunner | null];
  score: Record<TeamId, number>;
  lineScore: Record<TeamId, number[]>;
  battingIndex: Record<TeamId, number>;
  lineups: Record<TeamId, string[]>;
  pitchers: Record<TeamId, PitcherGameState>;
  phase: GamePhase;
  log: GameLogEntry[];
  nextLogId: number;
  focusLogId?: number;
  userGameStats: BatterStats;
  /** 마지막으로 동점이 깨진 순간의 승리·패전 투수 후보입니다. */
  pitchingDecision?: PitchingDecisionState;
  finalized: boolean;
  summary?: GameSummary;
}

export interface SeasonConfig {
  playerName: string;
  position: UserFieldPosition;
  userTeam: TeamId;
  battingOrder: number;
  targetAvgMin: number;
  targetAvgMax: number;
  homeRunCap: number;
  enforceHomeRunCap: boolean;
  stealSuccess: number;
  seed: number;
  debutYear: number;
  isFinalSeason: boolean;
}

export interface SeasonGoals {
  battingOrder: number;
  targetAvgMin: number;
  targetAvgMax: number;
  homeRunCap: number;
  enforceHomeRunCap: boolean;
  isFinalSeason: boolean;
}

export interface CareerSeasonSummary {
  season: number;
  teamId: TeamId;
  playerStats: BatterStats;
  teamRecord: TeamRecord;
  goals: SeasonGoals;
  postseason?: {
    qualified: boolean;
    champion: TeamId;
    playerStats: BatterStats;
    seriesStats?: PostseasonBattingSummary[];
  };
}

export interface CareerState {
  debutYear: number;
  status: "ACTIVE" | "RETIRED";
  finalSeason?: number;
  seasons: CareerSeasonSummary[];
}

export interface LeagueDataset {
  schemaVersion: 1;
  label: string;
  sourceSeason?: number;
  teams: Record<TeamId, TeamDefinition>;
}

export interface PostseasonSeries {
  stage: Exclude<CompetitionStage, "REGULAR_SEASON">;
  higherSeed: TeamId;
  lowerSeed: TeamId;
  higherSeedNumber: number;
  lowerSeedNumber: number;
  wins: Partial<Record<TeamId, number>>;
  ties: number;
  neededWins: number;
  gamesPlayed: number;
}

export interface PostseasonGameRecord {
  stage: Exclude<CompetitionStage, "REGULAR_SEASON">;
  gameNumber: number;
  summary: GameSummary;
  /** 사용자 경기의 기록 스냅샷. 이전 세이브에는 없을 수 있습니다. */
  userStats?: BatterStats;
}

export interface PostseasonBattingSummary {
  stage: PostseasonSeries["stage"];
  games: number;
  playerStats: BatterStats;
  /** 이전 세이브에 경기별 기록이 없으면 정확한 분할 집계가 불가능합니다. */
  complete: boolean;
}

export interface PostseasonState {
  seeds: TeamId[];
  series: PostseasonSeries;
  completedSeries: PostseasonSeries[];
  games: PostseasonGameRecord[];
  playerStats: Record<string, BatterStats>;
  champion?: TeamId;
}

export interface SeasonState {
  schemaVersion: 4;
  season: number;
  rngState: number;
  config: SeasonConfig;
  career: CareerState;
  leagueData: LeagueDataset;
  schedule: DaySchedule[];
  currentDay: number;
  teamRecords: Record<TeamId, TeamRecord>;
  headToHead: Record<string, HeadToHeadRecord>;
  playerStats: Record<string, BatterStats>;
  progress: SeasonProgress;
  postseason?: PostseasonState;
  game: GameState | null;
  lastResults: GameSummary[];
}
