// Deterministic preview: no files are written. Does not stack changes on an edited JSON.
import { readFileSync } from "node:fs";
import { calculatePitcherGrade } from "../src/engine/pitcherGrade.ts";
const dataset = JSON.parse(readFileSync(new URL("../docs/sources/2017-season-data-before-balance.json", import.meta.url), "utf8"));
const settings = JSON.parse(readFileSync(new URL("./data/2017-team-balance.json", import.meta.url), "utf8"));
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
dataset.label = settings.label;
for (const [id, team] of Object.entries(dataset.teams)) {
  const adjustment = settings.teams[id];
  team.strength = adjustment.strength; // Descriptive only; engine does not use this.
  for (const hitter of team.hitters) {
    const stats = hitter.statProfile;
    stats.avg = +clamp(stats.avg + adjustment.avg, 0.170, 0.399).toFixed(3);
    stats.homeRuns = Math.round(stats.homeRuns * adjustment.homeRuns);
    stats.eye = clamp(stats.eye + adjustment.eye, 1, 10);
  }
  for (const pitcher of team.pitchers) {
    const delta = adjustment.pitching + (adjustment.pitcherBonuses?.[pitcher.name] ?? 0);
    for (const key of ["stuff", "movement", "control"]) pitcher[key] = clamp(pitcher[key] + delta, 15, 99);
    pitcher.stamina = clamp(pitcher.stamina + adjustment.stamina, 25, 99);
    pitcher.grade = calculatePitcherGrade(pitcher);
  }
}
console.log(JSON.stringify(dataset, null, 2));
