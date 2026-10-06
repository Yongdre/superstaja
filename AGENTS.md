# 슈퍼스타자 & Best Pitcher

This is one React + TypeScript + Vite project containing two games. Work from the repository root.

## Setup and commands

- Use Node.js 24 and pnpm 11.19.0, as specified in `.nvmrc` and `package.json`.
- Install with `pnpm install --frozen-lockfile`.
- Run relevant tests with `pnpm test`; build with `pnpm build`.
- In a cloud environment, start the preview with `pnpm dev:cloud` on port 5174. Open the environment's preview URL, not a device's localhost URL.
- The root install covers both games. `_mlb` contains MLB source and data used by the root app; do not install or deploy it as a separate project unless asked.

## Project map

- `/`: game selection, `src/GameHub.tsx`.
- `/superstaja/`: KBO and MLB batter careers, `src/batting/`, `src/App.tsx`, `_mlb/src/App.tsx`.
- `/best-pitcher/`: KBO and MLB starting-pitcher careers, `src/pitcher/`.
- Runtime season data: `src/data/seasons/*.json` and `_mlb/src/data/seasons/*.json`. Keep all these files in Git so fresh cloud checkouts work.
- `pnpm build` produces all three entry points in `dist/`.

## Existing behavior to preserve

- Both games let the user select KBO or MLB and have separate browser save keys.
- Keep current save/import compatibility and completed-game statistics. Browser saves are per device/origin and are transferred through JSON export/import; they are not source files.
- Best Pitcher uses a minimum ERA target, including its existing forced-home-run rule. Do not invert the target or change baseball rules during presentation edits.
- The pitcher screen flows from scoreboard/bases to opposing batter, streaks, choices, commentary, today's pitching, and season totals. Its compact field status shows inning (`▲` top, `▼` bottom), score, outs, and today's strikeouts (`K`).
- Team streaks include all completed games, including games between the user's starts.
- Do not modify raw player/season statistics unless requested. Preserve the lazy loading of the selected pitcher season.

Keep credentials, local research/backups, browser saves, `node_modules`, and generated `dist` out of commits. See `docs/cloud-development.md` for the handoff workflow.
