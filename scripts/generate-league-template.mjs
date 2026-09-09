import { mkdir, readFile, writeFile } from "node:fs/promises";
import { calculatePitcherGrade } from "../src/engine/pitcherGrade.ts";

const sourceFile = new URL("../src/data/seasons/kbo-league-data-2017.json", import.meta.url);
const outputDirectory = new URL("../src/data/templates/", import.meta.url);
const outputFile = new URL("kbo-league-data-template.json", outputDirectory);
const source = JSON.parse(await readFile(sourceFile, "utf8"));

const hitterProfiles = [
  { position: "CF,LF,RF", bats: "L", games: 144, avg: 0.295, homeRuns: 8, eye: 6, speed: 9 },
  { position: "2B,SS", bats: "R", games: 144, avg: 0.285, homeRuns: 10, eye: 6, speed: 8 },
  { position: "RF,LF", bats: "L", games: 144, avg: 0.310, homeRuns: 22, eye: 7, speed: 6 },
  { position: "1B,DH", bats: "R", games: 144, avg: 0.320, homeRuns: 35, eye: 8, speed: 3 },
  { position: "LF,RF,1B", bats: "R", games: 144, avg: 0.285, homeRuns: 25, eye: 5, speed: 5 },
  { position: "3B,1B", bats: "R", games: 144, avg: 0.275, homeRuns: 18, eye: 5, speed: 5 },
  { position: "SS,2B,3B", bats: "R", games: 144, avg: 0.270, homeRuns: 12, eye: 5, speed: 8 },
  { position: "C", bats: "R", games: 144, avg: 0.255, homeRuns: 14, eye: 5, speed: 2 },
  { position: "DH,1B", bats: "L", games: 144, avg: 0.280, homeRuns: 20, eye: 6, speed: 3 },
];

const pitcherProfiles = [
  { role: "SP", throws: "R", stuff: 88, movement: 84, control: 83, stamina: 92 },
  { role: "SP", throws: "L", stuff: 82, movement: 79, control: 80, stamina: 88 },
  { role: "SP", throws: "R", stuff: 77, movement: 76, control: 75, stamina: 84 },
  { role: "SP", throws: "L", stuff: 72, movement: 72, control: 70, stamina: 78 },
  { role: "SP", throws: "R", stuff: 68, movement: 69, control: 66, stamina: 74 },
  { role: "RP", throws: "R", stuff: 82, movement: 80, control: 78, stamina: 58 },
  { role: "RP", throws: "L", stuff: 78, movement: 82, control: 72, stamina: 55 },
  { role: "RP", throws: "R", stuff: 76, movement: 73, control: 75, stamina: 52 },
  { role: "RP", throws: "R", stuff: 72, movement: 70, control: 68, stamina: 50 },
  { role: "CP", throws: "R", stuff: 92, movement: 88, control: 85, stamina: 55 },
];

const teams = Object.fromEntries(Object.entries(source.teams).map(([teamId, team]) => [teamId, {
  id: team.id,
  name: team.name,
  shortName: team.shortName,
  city: team.city,
  primary: team.primary,
  accent: team.accent,
  strength: 70,
  hitters: hitterProfiles.map((profile, index) => ({
    id: `${teamId}-TEMPLATE-H${String(index + 1).padStart(2, "0")}`,
    name: `${team.shortName} 타자 ${index + 1}`,
    position: profile.position,
    bats: profile.bats,
    availability: "REGULAR",
    statProfile: Object.fromEntries(Object.entries(profile).filter(([key]) => !["position", "bats"].includes(key))),
  })),
  pitchers: pitcherProfiles.map((profile, index) => ({
    id: `${teamId}-TEMPLATE-P${String(index + 1).padStart(2, "0")}`,
    name: `${team.shortName} 투수 ${index + 1}`,
    throws: profile.throws,
    role: profile.role,
    grade: calculatePitcherGrade(profile),
    ...Object.fromEntries(Object.entries(profile).filter(([key]) => !["role", "throws"].includes(key))),
  })),
}]));

const template = {
  schemaVersion: 1,
  label: "2099 KBO 타자 성적·투수 능력치 입력 템플릿",
  sourceSeason: 2099,
  teams,
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(template, null, 2)}\n`, "utf8");
console.log(outputFile.pathname);
