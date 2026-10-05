// Read-only, all-AI regular-season audit. Uses the actual game engine unchanged.
// node scripts/audit-team-balance.mjs [dataset.json] [seasons=20] [seedStart=1000]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const filename = resolve(process.argv[2] ?? "src/data/seasons/2017-season-data.json");
const count = Number(process.argv[3] ?? 20);
const seedStart = Number(process.argv[4] ?? 1000);
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(seedStart)) throw new Error("Invalid audit arguments");
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { simulateRegularSeason } = await server.ssrLoadModule("/src/engine/gameEngine.ts");
  const { validateLeagueDataset } = await server.ssrLoadModule("/src/data/leagueDataset.ts");
  const dataset = validateLeagueDataset(JSON.parse(readFileSync(filename, "utf8")));
  const ids = Object.keys(dataset.teams);
  const seasonResults = [];
  for (let index = 0; index < count; index += 1) {
    const seed = seedStart + index;
    const results = simulateRegularSeason(seed, dataset).teams;
    for (const id of ids) if (results[id].games !== 144) throw new Error("Incomplete season " + id);
    seasonResults.push(results);
  }
  const summary = ids.map(id => {
    const mean = key => seasonResults.reduce((sum, s) => sum + s[id][key], 0) / count;
    const wins = mean("wins"), losses = mean("losses");
    const winSd = Math.sqrt(seasonResults.reduce((sum, s) => sum + (s[id].wins - wins) ** 2, 0) / Math.max(1, count - 1));
    return { id, wins: +wins.toFixed(2), losses: +losses.toFixed(2), ties: +mean("ties").toFixed(2),
      pct: +(wins / (wins + losses)).toFixed(4),
      runsForPerGame: +(mean("runsFor") / 144).toFixed(3), runsAgainstPerGame: +(mean("runsAgainst") / 144).toFixed(3),
      winMean95HalfWidth: +(1.96 * winSd / Math.sqrt(count)).toFixed(2) };
  }).sort((a, b) => b.pct - a.pct);
  console.log(JSON.stringify({ dataset: dataset.label, seasons: count, seedStart, games: count * 720, mode: "all-AI; actual engine; 144-game regular seasons; no user player; no postseason", summary }, null, 2));
} finally { await server.close(); }
