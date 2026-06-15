# Pill ID

`Pill ID` is a Reddit-native guessing game built with Devvit Web.

Players see pill media from a bundled demo set, choose the matching logo, compare their score against the shared leaderboard, and play through multiple arcade-style round types.

## Features

- Startup screen with leaderboard and mode selection
- Shared high score leaderboard stored in Devvit Redis
- Game modes:
  - `Find the Correct Pill`
  - `Match Pairs`
  - `Memory Game`
  - `Speed Round`
  - `Higher or Lower`
  - `Broken Challenge`
- Error reporting per question
- Local preview mode that serves the built app at `http://127.0.0.1:3131`

## Local structure

- `src/client` – game UI, states, styling, Three.js viewer
- `src/server` – API, leaderboard storage, round generation, seed menu action
- `public/demo` – bundled local demo assets used during playtest

## Local preview

Devvit Web still centers around `devvit playtest`, but this repo now includes a faster browser-only preview loop for styling and gameplay iteration:

1. Run `yarn local`
2. Wait for the first build to finish
3. Open [http://127.0.0.1:3131](http://127.0.0.1:3131)

This starts:

- `vite build --watch` for client + server rebuilds
- a local Node server that serves `dist/client` and mounts the existing `/api/*` routes

If you prefer two terminals instead of one script:

- Terminal 1: `./scripts/run-with-node22.sh local:build`
- Terminal 2: `./scripts/run-with-node22.sh local:serve`

This repo pins Node `22.22.3` in [.nvmrc](.nvmrc). The wrapper script auto-selects that runtime from `~/.nvm` so local preview still works even if your current shell is on Node 20.

## Notes

- The official Devvit Vite plugin still does not support `vite dev` / HMR, so this local preview uses watched builds rather than full hot reload.
- The local server itself is intentionally not run with recursive file watching because Node watch hits macOS file descriptor limits in this repo. Client/CSS changes refresh after rebuild; if you change server boot code, restart `yarn local:serve`.
- The project currently uses bundled local media because live remote fetch from the external DrugsPRO domain still depends on Reddit Devvit HTTP domain approval.

## Documents

- Terms: [TERMS.md](TERMS.md)
- Privacy: [PRIVACY.md](PRIVACY.md)
