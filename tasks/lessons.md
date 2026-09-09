# Lessons Learned

(Updated after corrections from the user)

## Stale Client Build
- **Always rebuild client dist after making client-side changes** — the production server serves from `client/dist/`, not the source files
- After implementing features that span both client and server (like SYNC_GUESS), verify the built JS contains the new code: `grep -c "sync_guess" client/dist/assets/*.js`
- The `npm run build` from the root package.json runs `cd client && npm run build`

## Socket ID Remapping
- When remapping socket IDs (in `reconnectPlayer`, `rejoinAsPlayer`), ALL hotSeat maps keyed by socketId must be updated: `playerShuffles`, `roundScores`, `playerId`, `coopSecondId`
- Easy to miss new maps added later — treat this as a checklist item when adding new per-player data to hotSeat

## Generated Content Files
- `shared/deck.json` is **generated**, not source. Edit `scripts/deck-gen/deck-specs.mjs` (labels/prompts/tiers) or `scripts/deck-gen/decks-*.mjs` (cards), then run `npm run deck:build`
- The assembler doubles as the validator — it fails the build on style-guide violations, so there is no separate lint step to remember

## Committed node_modules
- `client/node_modules` and `client/dist` are tracked in git and there is no `.gitignore`
- Never `rm -rf client/node_modules` to fix a build — it produces a 1,200-file diff. If a reinstall is unavoidable, restore afterwards with `git checkout -- client/node_modules client/package-lock.json && git clean -fdq client/node_modules`
