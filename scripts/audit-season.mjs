import { createServer } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const number = Number(process.argv.find(a => a.startsWith("--seasons="))?.split("=")[1] ?? 3);
const firstSeed = Number(process.argv.find(a => a.startsWith("--seed="))?.split("=")[1] ?? 2026);
if (!Number.isInteger(number) || number < 1 || number > 100 || !Number.isInteger(firstSeed)) throw new Error("--seasons=1..100, --seed=정수");
const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { simulateRegularSeason } = await server.ssrLoadModule("/src/engine/gameEngine.ts");
  const { validateLeagueDataset, defaultLeagueDataset } = await server.ssrLoadModule("/src/data/leagueDataset.ts");
  const file = process.argv.find(a => a.startsWith("--data="))?.slice(7);
  const dataset = file ? validateLeagueDataset(JSON.parse(readFileSync(file, "utf8"))) : defaultLeagueDataset;
  const results = [];
  for (let i = 0; i < number; i++) {
    const result = simulateRegularSeason(firstSeed + i, dataset);
    results.push(result);
    console.error("Completed season " + (i + 1) + "/" + number);
  }
  const keys = ["avg","homeRuns","runsPerTeamGame","walksPerPA","strikeoutsPerPA","pitchesPerPA","starterInnings","stolenBases","caughtStealing"];
  const mean = Object.fromEntries(keys.map(key => [key, results.reduce((sum, r) => sum + r[key], 0) / number]));
  console.log(JSON.stringify({ label: dataset.label, note: "CPU-only diagnostics; no saves or source JSON modified. Target profiles do not guarantee exact results.", mean, results }, null, 2));
} finally { await server.close(); }
