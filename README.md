# Sorted!

A real-time multiplayer party game where players rank things, guess each other's rankings, and argue about who's right.

**3–10 players** | **Browser-based** | **No sign-up required**

## How It Works

1. **Rank** — Each player gets a different category (e.g. "Foods & Drinks") or situation (e.g. "Desert Island") with 5 cards to rank on a subjective scale.
2. **Guess** — One player at a time is in the "Spotlight." Everyone else sees their cards and tries to guess how they ranked them.
3. **Reveal** — The Spotlight player reveals their ranking one card at a time, sparking debates and scoring points.
4. **Score** — Exact match = 2 pts, off-by-one = 1 pt. Spotlight player earns 1 pt for each card someone guessed exactly.
5. **Repeat** — Cycle through all players, then start a new round with fresh categories.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19, Vite 6, Tailwind CSS 4, dnd-kit |
| Backend | Node.js, Express, Socket.io 4 |
| State | In-memory (no database) |
| Drag & Drop | dnd-kit (touch + mouse) |

## Quick Start

### Development

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Start the server (port 3001)
cd ../server && npm run dev

# Start the client (port 5173, proxies to server)
cd ../client && npm run dev
```

Open `http://localhost:5173` in multiple tabs to test.

### Production

```bash
# From root
npm run install:all
npm run build
npm start
```

The server serves the built client and runs on `PORT` (default 3001).

## Project Structure

```
├── client/           # React frontend (Vite)
│   └── src/
│       ├── components/screens/   # 8 game screens
│       ├── components/ui/        # Timer component
│       ├── hooks/                # useSocket, useGameState
│       └── context/              # GameContext (room state)
├── server/           # Node.js backend
│   ├── index.js      # Express + Socket.io entry point
│   ├── roomManager.js # Room lifecycle, reconnection
│   ├── gameEngine.js  # Game logic, scoring, timers
│   └── deckManager.js # Card dealing
├── shared/
│   ├── deck.json      # 1,500 cards (30 categories + 30 situations)
│   └── socketEvents.js
├── PLAN.md           # Full technical plan
└── Procfile          # Deployment
```

## Game Features

- **Different content per player** — Each player gets a unique category or situation each round
- **1–3 rounds** per game, alternating between categorical and situational rounds
- **Reconnection** — Session tokens allow rejoining after refresh or disconnect (60s grace period)
- **Auto-reveal** — If the Spotlight player disconnects, cards auto-reveal after 10 seconds
- **Mobile-friendly** — Touch drag-and-drop via dnd-kit sensors
- **No database** — Rooms are ephemeral, in-memory only

## Tests

```bash
# Start server first
cd server && npm start &

# Run all test suites
node test-phase1.js
node test-comprehensive.js
node test-phase3.js
node test-phase4.js
node test-phase5.js
node test-phase6.js
node test-phase7-autoreveal.js
```

227 tests covering room management, game flow, scoring, edge cases, and disconnection handling.
