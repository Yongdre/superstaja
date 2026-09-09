// Read-only diagnostics: no league JSON or saves are changed.
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const engine = await server.ssrLoadModule("/src/engine/gameEngine.ts");
  const { resolvePlateAppearance } = await server.ssrLoadModule("/src/engine/plateAppearance.ts");
  const { estimateHitterRatings, estimatePitcherRatings } = await server.ssrLoadModule("/src/engine/playerProfiles.ts");
  const { defaultLeagueDataset, validateLeagueDataset } = await server.ssrLoadModule("/src/data/leagueDataset.ts");
  const { emptyBatterStats, avg } = await server.ssrLoadModule("/src/engine/statistics.ts");
  const { SeededRng } = await server.ssrLoadModule("/src/engine/rng.ts");

  const state = engine.createExampleSave();
  const samples = [];
  for (const homeRuns of [0, 30]) {
    for (const rating of [50, 72, 95]) {
      const profile = { games: 144, avg: 0.3, homeRuns, eye: 5, speed: 5 };
      const batter = { id: "AUDIT", name: "진단 타자", position: "DH", bats: "R", statProfile: profile, ...estimateHitterRatings(profile) };
      const pitcher = { ...defaultLeagueDataset.teams.DOO.pitchers[0], stuff: rating, movement: rating, control: rating };
      const stats = { AUDIT: emptyBatterStats() };
      const rng = new SeededRng(2017);
      for (let pa = 0; pa < 100000; pa += 1) {
        state.game.bases = [null, null, null];
        state.game.outs = 0;
        state.game.inning = 1;
        resolvePlateAppearance({ game: state.game, batter, pitcher, battingTeam: "SAM", stats, rng });
      }
      samples.push({ targetAvg: 0.3, targetHr: homeRuns, pitcherRating: rating, simulatedAvg: +avg(stats.AUDIT).toFixed(3), hrPer590PA: +(stats.AUDIT.hr / 100000 * 590).toFixed(2) });
    }
  }
  console.log("Controlled plate appearances (empty bases, 100,000 PA per case; not a full-season calibration)");
  console.table(samples);
  console.log("Legacy statProfile pitcher conversion (Yang 2017 input):", estimatePitcherRatings({ era: 3.44, innings: 193 + 1 / 3, games: 31, strikeouts: 158, walks: 45 }, "SP"));

  const invalid = structuredClone(defaultLeagueDataset);
  invalid.teams.KIA.hitters[0].statProfile = { games: 144, avg: 0.2, homeRuns: 900, atBats: 100, plateAppearances: 100 };
  let rejected = false;
  try { validateLeagueDataset(invalid); } catch { rejected = true; }
  console.log("Contradictory input rejected:", rejected);

  const duplicateExamples = [];
  for (let seed = 1; seed <= 20; seed += 1) {
    let gameState = engine.createNewSeason({ playerName: "진단", seed });
    for (let step = 0; step < 100 && !gameState.game.finalized; step += 1) {
      gameState = gameState.game.phase === "WAITING_FOR_STEAL"
        ? engine.resolveUserSteal(gameState, false) : engine.applyUserChoice(gameState, "OUT");
    }
    const changes = gameState.game.log.map((entry) => entry.text).filter((text) => text.includes("투수 교체:"));
    const duplicates = changes.filter((text, index) => changes.indexOf(text) !== index);
    if (duplicates.length) duplicateExamples.push({ seed, duplicates });
  }
  console.log("Repeated pitching changes in 20 completed user games:", JSON.stringify(duplicateExamples, null, 2));
} finally {
  await server.close();
}
