// Read-only, all-AI regular-season audit. Uses the actual game engine unchanged.
// node scripts/audit-team-balance.mjs [dataset.json] [seasons=20] [seedStart=1000]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const filename = resolve(process.argv[2] ?? "src/data/seasons/2017-season-data.json");
const count = Number(process.argv[3] ?? 20);
const seedStart = Number(process.argv[4] ?? 1000);
if (!Number.isInteger(count) || count < 1 || !Number.isInteger(seedStart)) throw new Error("Invalid audit arguments");
const server = await createServer({
  server: { middlewareMode: true }, appType: "custom", logLevel: "error",
  plugins: [{
    name: "audit-only-engine-export", enforce: "pre",
    transform(code, id) {
      if (id.replaceAll("\\", "/").endsWith("/src/engine/gameEngine.ts")) {
        // Expose the existing private loop in this audit's memory only.
        return code + "\nexport { runAutomaticGame as auditAutomaticGame };\n";
      }
    },
  }],
});
try {
  const { createGame, auditAutomaticGame, defaultSeasonConfig } = await server.ssrLoadModule("/src/engine/gameEngine.ts");
  const { validateLeagueDataset } = await server.ssrLoadModule("/src/data/leagueDataset.ts");
  const { generateSchedule } = await server.ssrLoadModule("/src/engine/schedule.ts");
  const { SeededRng } = await server.ssrLoadModule("/src/engine/rng.ts");
  const { emptyBatterStats } = await server.ssrLoadModule("/src/engine/statistics.ts");
  const dataset = validateLeagueDataset(JSON.parse(readFileSync(filename, "utf8")));
  const ids = Object.keys(dataset.teams);
  const seasonResults = [];
  for (let index = 0; index < count; index += 1) {
    const seed = seedStart + index;
    const schedule = generateSchedule(ids, 2017);
    const rng = new SeededRng(seed);
    const results = Object.fromEntries(ids.map(id => [id, { games: 0, wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0 }]));
    const state = {
      // No roster is replaced by the user. This sentinel exists only in the audit.
      config: { ...defaultSeasonConfig, userTeam: "AUDIT_NO_USER", seed },
      season: 2017, progress: "REGULAR_SEASON", leagueData: dataset,
      playerStats: Object.fromEntries(Object.values(dataset.teams).flatMap(t => t.hitters.map(h => [h.id, emptyBatterStats()]))),
    };
    for (const day of schedule) for (const fixture of day.games) {
      const game = createGame(state, fixture);
      state.game = game;
      if (game.lineups[fixture.home].includes("USER-PLAYER") || game.lineups[fixture.away].includes("USER-PLAYER")) throw new Error("User leaked into all-AI audit");
      auditAutomaticGame(state, game, rng, false);
      if (game.phase !== "GAME_END_TRANSITION") throw new Error("Game did not finish");
      const home = results[fixture.home], away = results[fixture.away];
      const hs = game.score[fixture.home], as = game.score[fixture.away];
      home.games++; away.games++;
      home.runsFor += hs; home.runsAgainst += as;
      away.runsFor += as; away.runsAgainst += hs;
      if (hs === as) { home.ties++; away.ties++; }
      else if (hs > as) { home.wins++; away.losses++; }
      else { away.wins++; home.losses++; }
    }
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
