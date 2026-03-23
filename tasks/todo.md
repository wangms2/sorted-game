# Phase 7 — Polish & Edge Cases

## Plan

Phase 7 items from plan, with current status:

### Already Done
- [x] Disconnect 60s window (roomManager.handleDisconnect)
- [x] Skip removed/disconnected players in hot seat cycling (advanceHotSeat)
- [x] End game if <3 connected players (handleDisconnect timer)
- [x] Input validation: name 1-20 chars, ranking/guess arrays, phase-gating
- [x] Error toasts (App.jsx red overlay with auto-dismiss)
- [x] Touch sensors on dnd-kit (PointerSensor + TouchSensor in Ranking/Guessing)

### Remaining Work
- [x] 1. Auto-reveal for disconnected hot seat (10s timeout in reveal phase)
- [x] 2. Loading/connecting state on LandingScreen
- [x] 3. Deployment: serve built client from Express, PORT env var, Procfile
- [x] 4. Integration test: disconnected hot seat auto-reveal
- [x] 5. Run all tests, verify client build

### Scope Decisions
- **Mobile responsiveness**: dnd-kit already has PointerSensor + TouchSensor configured. Tailwind is mobile-first. viewport meta is in index.html by default via Vite. No extra work needed unless specific issues found.
- **WaitingForRanksScreen**: Already folded into RankingScreen (shows waiting UI after lock-in). No separate component needed.

## Review

All Phase 7 items complete. Summary:

1. **Auto-reveal**: Extracted `revealPosition()` helper from `revealNext()`. Added `autoRevealRemaining()`, `scheduleAutoReveal()` (10s timer), `cancelAutoReveal()` to gameEngine.js. Wired into: disconnect handler (hot seat disconnects in reveal), `checkAllGuessed`/`handleGuessingTimeout` (hot seat already disconnected when entering reveal), reconnect handler (cancels timer if hot seat reconnects).

2. **Loading state**: LandingScreen shows "Creating…"/"Joining…" on buttons after click, disables Back button. Resets on error via `useEffect` watching `error` from context.

3. **Deployment**: Root `package.json` with `install:all`/`build`/`start` scripts. `Procfile` for Heroku. Express serves `client/dist/` as static with SPA fallback.

4. **Tests**: 14 new tests covering: hot seat disconnect in reveal → auto-reveal after 10s, hot seat disconnect in guessing → auto-reveal after transition, reconnect cancels auto-reveal + manual reveal still works.

5. **Regression**: All 227 tests pass (8 + 61 + 41 + 35 + 37 + 31 + 14). Client builds cleanly (76 modules, 310KB JS).
