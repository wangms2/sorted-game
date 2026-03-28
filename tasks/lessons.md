# Lessons Learned

(Updated after corrections from the user)

## Stale Client Build
- **Always rebuild client dist after making client-side changes** — the production server serves from `client/dist/`, not the source files
- After implementing features that span both client and server (like SYNC_GUESS), verify the built JS contains the new code: `grep -c "sync_guess" client/dist/assets/*.js`
- The `npm run build` from the root package.json runs `cd client && npm run build`

## Socket ID Remapping
- When remapping socket IDs (in `reconnectPlayer`, `rejoinAsPlayer`), ALL hotSeat maps keyed by socketId must be updated: `playerShuffles`, `roundScores`, `playerId`, `coopSecondId`
- Easy to miss new maps added later — treat this as a checklist item when adding new per-player data to hotSeat
