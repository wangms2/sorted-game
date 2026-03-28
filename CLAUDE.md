# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- Install dependencies: `npm run install:all` (installs both server and client)
- Start server in development: `npm run dev` (runs `server/npm run dev` on port 3001)
- Start client in development: `cd client && npm run dev` (runs Vite on port 5173, proxies to server)
- Run both concurrently: start server in one terminal, client in another

### Production
- Build client: `npm run build` (builds to `client/dist/`)
- Start server: `npm start` (serves built client from `client/dist/` on `PORT` env var, default 3001)

### Testing
- Tests are located in `server/test-*.js`
- Run all test suites (server must be running):
  ```bash
  cd server && npm start &
  node test-phase1.js
  node test-comprehensive.js
  node test-phase3.js
  node test-phase4.js
  node test-phase5.js
  node test-phase6.js
  node test-phase7-autoreveal.js
  ```
- 227 tests covering room management, game flow, scoring, edge cases, and disconnection handling.

## Architecture Overview

### Project Structure
- `client/` – React 19 frontend (Vite, Tailwind CSS 4, dnd-kit)
  - `src/components/screens/` – 8 game screens (Landing, Lobby, Ranking, Guessing, HotSeatWaiting, Reveal, Scores, End)
  - `src/components/ui/` – Timer component
  - `src/hooks/` – `useSocket` (singleton connection with auto-reconnect), `useGameState` (derived state)
  - `src/context/` – `GameContext` (room state, ROOM_UPDATED handler)
- `server/` – Node.js backend (Express, Socket.io 4)
  - `index.js` – Express + Socket.io entry point
  - `roomManager.js` – Room lifecycle, reconnection logic
  - `gameEngine.js` – Game logic, scoring, timers
  - `deckManager.js` – Card dealing, round assignment
- `shared/` – Shared between client and server
  - `deck.json` – ~1,500 cards (30 categories × 25 cards + 30 situations × 25 cards)
  - `socketEvents.js` – Event constants (ESM)
- `PLAN.md` – Full technical plan with detailed game flow, data model, and implementation phases
- **ESM everywhere** – All `package.json` files have `"type": "module"`; use ES6 imports/exports.

### Game Flow
1. **Lobby** – Host configures rounds (1–3), 3+ players required to start.
2. **Per Round** – Server picks round type (categorical or situational), deals each player a unique category/situation with 5 cards.
3. **Ranking Phase** – All players rank their own 5 cards on a subjective scale.
4. **Hot Seat Cycle** – For each player:
   - **Guessing Phase** – Other players see hot seat's cards + scale, guess ranking.
   - **Reveal Phase** – Hot seat reveals cards one at a time, scores awarded incrementally.
   - **Scores Phase** – Round scores displayed, auto‑advance or host continues.
5. **Game End** – After all rounds, final scoreboard, option to Play Again.

Phases: `"lobby"` | `"ranking"` | `"guessing"` | `"reveal"` | `"scores"` | `"game_end"`

### State Management
- **Room Object** – Server‑side in‑memory state (no database). Contains players, phase, round tracking, hot seat state, timers.
- **Per‑socket filtering** – `filterRoomForPlayer(room, socketId)` strips private data (other players' rankings, guesses, assignments, session tokens).
- **Reconnection** – Session tokens stored client‑side in localStorage; 60‑second grace period for rejoining.
- **Disconnection handling** – Hot seat auto‑reveal after 10 seconds; game ends if <3 players remain.

### Socket Events
Defined in `shared/socketEvents.js`. Key events:
- **Client → Server**: `CREATE_ROOM`, `JOIN_ROOM`, `RECONNECT`, `START_GAME`, `SUBMIT_RANKING`, `SUBMIT_GUESS`, `REVEAL_NEXT`, `ADVANCE_ROUND`, `PLAY_AGAIN`
- **Server → Client**: `ROOM_UPDATED` (filtered room), `TIMER_SYNC`, `ERROR`

### Deck Structure
- **Categories**: `id`, `name`, `scale`, `cards` (25 per category)
- **Situations**: `id`, `name`, `prompt` (used as scale), `cards` (25 per situation)
- Each player receives a unique category/situation per round; categories/situations are not reused across rounds.

### Scoring
- **Guesser**: +2 exact match, +1 off‑by‑one (max 10 points per round)
- **Hot seat**: +1 per card that any guesser placed exactly right (max 5 points per round)

## Important Notes from Project Guidelines

### Plan Mode & Verification
- Enter plan mode for any non‑trivial task (3+ steps or architectural decisions).
- After a correction from the user, update `tasks/lessons.md` with the pattern and write rules to prevent the same mistake.
- Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness.
- For non‑trivial changes, pause and ask “is there a more elegant way?” but avoid over‑engineering simple fixes.

### Subagent Strategy
- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- One task per subagent for focused execution.

### Autonomous Bug Fixing
- When given a bug report, just fix it. Don’t ask for hand‑holding.
- Point at logs, errors, failing tests—then resolve them.
- Zero context switching required from the user.

### General Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Plan First**: Write plan to `tasks/todo.md` with checkable items and verify before starting implementation.
- **Track Progress**: Mark items complete as you go.
- **Explain Changes**: High‑level summary at each step.
- **Document Results**: Add review section to `tasks/todo.md`.
- **Capture Lessons**: Update `tasks/lessons.md` after corrections.

## Additional Context
- The game is designed for 3–10 players, browser‑based, no sign‑up required.
- All state is ephemeral (in‑memory). Rooms are not persisted.
- Mobile‑friendly touch drag‑and‑drop via dnd‑kit sensors.
- The client proxies API requests to the server via Vite config.