import raw from "./mlbTeams.json";
import type { MlbLeague, TeamId } from "../engine/types";
export const mlbTeams = raw as Array<{id: TeamId; mlbId: number; name: string; city: string; league: MlbLeague; division: string}>;
export const teamStructure = Object.fromEntries(mlbTeams.map(team => [team.id, team])) as Record<TeamId, typeof mlbTeams[number]>;
export const leagues: MlbLeague[] = ["AL", "NL"];
export const divisions = ["East", "Central", "West"];
