# Revised Plan: Rankit Party Game (v3)

## TL;DR
Real-time multiplayer party game (3-10 players). Each round: every player gets a DIFFERENT category (categorical round) or a different situational prompt (situational round), each with 5 cards to rank. After ranking, cycle through each player as hot seat — others see the hot seat player's cards + scale and guess their ordering. Multiple rounds per game. ~30 categories × 25 cards + ~30 situations × 25 cards. Per-socket filtered state. Session-token reconnection. ESM throughout.

---

## Game Flow

```
"lobby"
  → host configures number of rounds (1-3), clicks Start (3+ players)

  ┌─── PER ROUND ───────────────────────────────────────────────┐
  │                                                              │
  │  Server picks round type (categorical or situational)        │
  │  Deals each player a DIFFERENT category/situation + 5 cards  │
  │                                                              │
  │  "ranking"   ← all players rank their own 5 cards            │
  │    → all submit OR timer expires                             │
  │                                                              │
  │    ┌─── PER HOT SEAT PLAYER ─────────────────────────────┐  │
  │    │                                                      │  │
  │    │  "guessing"  ← others see hot seat's cards + scale,  │  │
  │    │               guess their ranking                     │  │
  │    │    → all guessers submit OR timer expires             │  │
  │    │                                                      │  │
  │    │  "reveal"    ← hot seat reveals 1 card at a time     │  │
  │    │    → all 5 revealed, scores awarded incrementally    │  │
  │    │                                                      │  │
  │    │  "scores"    ← round scores, auto-advance or host    │  │
  │    │    → next hot seat (loop) OR next round / game_end   │  │
  │    └──────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘

"game_end"  ← all rounds complete
```

Phase values: `"lobby"` | `"ranking"` | `"guessing"` | `"reveal"` | `"scores"` | `"game_end"`

---

## Deck Structure

### deck.json schema
```json
{
  "categories": [
    {
      "id": "foods",
      "name": "Foods & Drinks",
      "scale": "How much you're craving this right now",
      "cards": [
        { "id": "food_001", "text": "Tacos" },
        ...  // 25 cards per category
      ]
    },
    ...  // ~30 categories
  ],
  "situations": [
    {
      "id": "sit_001",
      "name": "Desert Island",
      "prompt": "You're stranded on a desert island for a month — rank what you'd miss most",
      "cards": [
        { "id": "sit_001_001", "text": "Sunscreen" },
        ...  // 25 cards per situation
      ]
    },
    ...  // ~30 situations
  ]
}
```

Key changes from original:
- Situations have their OWN dedicated cards (not drawn from categories)
- `compatible_categories` removed from situations
- Each situation's `prompt` IS the scale text during gameplay
- Situations get a `name` field for display in UI (short label)
- Card IDs for situations: `sit_{situationId}_{cardNum}` pattern
- ~30 categories × 25 cards = 750 category cards
- ~30 situations × 25 cards = 750 situation cards
- Total: ~1,500 cards

### Dealing logic per round
**Categorical round:**
1. From unused categories, randomly assign 1 unique category per player (N players → N categories used)
2. Shuffle each category's 25-card pool, deal 5 to the player
3. Each player sees their own category name + scale during ranking
4. Mark assigned categories as used (no repeats in later rounds)

**Situational round:**
1. From unused situations, randomly assign 1 unique situation per player (N players → N situations used)
2. Shuffle each situation's 25-card pool, deal 5 to the player
3. Each player sees their situation prompt as the scale during ranking
4. Mark assigned situations as used

**Math check:** 3 rounds × 10 players = 30 assignments max. With ~30 categories and ~30 situations, just fits. Recommend 30+ of each.

**During guessing:** All players see the hot seat player's:
- Category name OR situation prompt (their scale)
- Their 5 cards (shuffled, not in ranking order)

---

## Data Model

### Room Object (server-side)
```javascript
{
  code: "FROG",
  hostId: "socket-id",
  phase: "lobby",

  players: {
    "socket-id": {
      id: "socket-id",
      name: "Alice",
      sessionToken: "uuid-v4",
      score: 0,
      // Per-round (reset each round)
      assignment: {
        type: "category",             // "category" | "situation"
        id: "foods",                  // category id or situation id
        name: "Foods & Drinks",       // display name
        scale: "How much you're craving this right now",  // scale or prompt text
      },
      cards: [card, ...],            // 5 dealt cards
      ranking: null,                 // their ranking [cardId, ...]
      hasRanked: false,
      // Per-hot-seat-cycle (reset each cycle)
      currentGuess: null,
      hasGuessed: false,
      connected: true,
    }
  },

  playerOrder: ["socket-id", ...],
  hotSeatIndex: 0,

  // Round tracking
  currentRoundNumber: 1,
  totalRounds: 2,                   // configured in lobby (1-3)
  roundType: "category",            // "category" | "situation" (current round)
  usedCategoryIds: [],              // prevent reuse across rounds
  usedSituationIds: [],             // prevent reuse across rounds

  // Current hot seat state (reset per hot seat cycle)
  hotSeat: {
    playerId: "socket-id",
    revealIndex: 0,                 // 0-5
    roundScores: {},                // { playerId: pointsThisCycle }
  },

  settings: {
    rankingTimerSeconds: 60,
    guessingTimerSeconds: 90,
  },

  timerEndAt: null,
}
```

### Card Object
```javascript
{ id: "food_001", text: "Tacos" }
// No categoryId needed — card is always in context of its assignment
```

---

## Socket Events

```javascript
export const EVENTS = {
  // Client → Server
  CREATE_ROOM:     'create_room',      // { playerName }
  JOIN_ROOM:       'join_room',        // { roomCode, playerName }
  RECONNECT:       'reconnect',        // { sessionToken, roomCode }
  START_GAME:      'start_game',       // { totalRounds }  (host only)
  SUBMIT_RANKING:  'submit_ranking',   // { ranking: [cardId, ...] }
  SUBMIT_GUESS:    'submit_guess',     // { guess: [cardId, ...] }
  REVEAL_NEXT:     'reveal_next',      // {}  (hot seat only)
  ADVANCE_ROUND:   'advance_round',    // {}  (host only)
  PLAY_AGAIN:      'play_again',       // {}

  // Server → Client
  ROOM_UPDATED:    'room_updated',     // { room: filteredRoomObject }
  TIMER_SYNC:      'timer_sync',       // { endsAt: unixTimestamp }
  ERROR:           'error',            // { message }
};
```

### ROOM_UPDATED filtering
Per-socket emit. `filterRoomForPlayer(room, socketId)` strips:
- Other players' `ranking` (until their hot seat reveal)
- Other players' `currentGuess` (always hidden)
- Other players' `sessionToken` (security)
- Other players' `assignment`, `cards` (they see their own only; during guessing they see hot seat's via the hotSeat object)
- During reveal: hot seat player's ranking revealed only up to `revealIndex`

Additional data included for guessing/reveal phases:
```javascript
// Added to filtered room during guessing/reveal phases:
hotSeat: {
  playerId, revealIndex, roundScores,
  assignment: { ... },   // hot seat player's category/situation info
  cards: [ ... ],        // hot seat player's 5 cards (shuffled during guessing)
}
```

---

## Scoring

**Guesser** (per position on each REVEAL_NEXT):
- +2 exact, +1 off-by-one, 0 otherwise. Max 10/round.

**Hot seat** (per position on each REVEAL_NEXT):
- +1 if ANY guesser placed this card exactly right. Max 5/round.

---

## Reconnection
1. On join: server generates sessionToken, sends to client in filtered ROOM_UPDATED
2. Client stores {sessionToken, roomCode} in localStorage
3. On refresh: client emits RECONNECT before showing LandingScreen
4. Server matches token → swaps socket ID → emits ROOM_UPDATED
5. On disconnect: connected=false, 60s timer. Expired → remove. <3 players → end game.
6. Disconnected hot seat: auto-reveal remaining cards after 10s

---

## Build Phases

### Phase 0 — Card & Prompt Ideation

**Goal:** Create the full card deck: ~30 categories × 25 cards + ~30 situations × 25 cards.

**Category creation (target: 30 categories):**
- 6 existing categories to keep: `foods`, `comfort`, `social_dread`, `activities`, `upgrades`, `annoyances`
- 24 new categories needed. Examples of good candidates:
  - Movies & TV Shows, Music & Artists, Travel Destinations, Childhood Nostalgia
  - Superpowers, Fears & Phobias, Date Night Ideas, Workout Types
  - Apps & Websites, Fashion & Style, Holiday Traditions, Morning Routines
  - Weekend Plans, Pet Peeves, Guilty Pleasures, Dream Jobs
  - Party Games, Weather Types, Snack Time, Life Milestones
  - College Experiences, Work From Home, City vs Country, Relationship Green Flags
- Each category needs: `id`, `name`, `scale` (the ranking prompt), 25 `cards`
- Cards: relatable, conversational, occasionally funny, self-contained
- Scales should be opinionated/subjective (not factual). Good: "How much you'd miss this." Bad: "How expensive is this."

**Situation creation (target: 30 situations):**
- 20 existing prompts to migrate (strip `compatible_categories`, add dedicated `cards` array)
- 10 new situations needed
- Each situation needs: `id`, `name`, `prompt` (used as ranking scale), 25 `cards`
- Situation cards should be thematically relevant to the prompt
- Cards should span enough variety that ranking them is interesting/debatable
- Example: "You're stranded on a desert island" → cards like "a good knife", "sunscreen", "a satellite phone", "a hammock", "a fishing rod", etc.

**Deliverable:** `shared/deck.json` with ~30 categories (750 cards) + ~30 situations (750 cards) = ~1,500 total cards.

**Validation checklist:**
- [ ] Each category has exactly 25 cards
- [ ] Each situation has exactly 25 cards
- [ ] All IDs are unique
- [ ] No category/situation has fewer than 25 cards
- [ ] Situation prompts work as ranking scales (they tell you HOW to rank)
- [ ] Tone is consistent: relatable, opinionated, debatable

---

### Phase 1 — Project Setup & Server Skeleton

- [x] Initialize `client/`, `server/`, `shared/` directories
- [x] `shared/deck.json` from Phase 0
- [x] `shared/socketEvents.js` — ESM, all event constants
- [x] `server/package.json` with `"type": "module"`, deps: express, socket.io, cors, uuid, nodemon
- [x] `server/index.js` — Express + Socket.io on port 3001
- [x] `server/roomManager.js`
- [x] `filterRoomForPlayer(room, socketId)` — per-socket state sanitization
- [x] `emitRoomUpdate(io, room)` — per-socket filtered emit loop
- [x] Disconnect: `connected: false`, 60s timer, host reassignment
- [x] Verify: create/join/disconnect/reconnect

### Phase 2 — Client Scaffold + Lobby

- [x] Vite + React 19 + Tailwind v4 + dnd-kit
- [x] `vite.config.js` with socket.io proxy
- [x] `useSocket.js` — singleton connection, auto-reconnect with sessionToken
- [x] `GameContext.jsx` — room state, ROOM_UPDATED handler
- [x] `useGameState.js` — `isHost`, `isHotSeat`, `myPlayer`, `currentPhase`
- [x] `LandingScreen` — create/join forms, reconnection on mount
- [x] `LobbyScreen` — player list, room code, round count (1-3), Start button (3+ players)
- [x] `App.jsx` — phase-based screen router
- [x] Verify: two tabs join, lobby works, refresh reconnects

### Phase 3 — Ranking Phase

- [x] `server/deckManager.js` with `dealRound(room)`
- [x] `server/gameEngine.js` — startGame, submitRanking, checkAllRanked, handleRankingTimeout
- [x] `RankingScreen` — dnd-kit sortable, shows category/situation name + scale, Lock In, countdown
- [x] Verify: 3 players each get different categories, rank, timer works, transition

### Phase 4 — Guessing Phase

- [x] startGuessingPhase, submitGuess, checkAllGuessed, handleGuessingTimeout
- [x] `GuessingScreen` — hot seat player's name, category/situation, scale, shuffled cards, dnd-kit
- [x] `HotSeatWaitingScreen` — shows who has guessed
- [x] Verify: hot seat waiting, others guess, timer works

### Phase 5 — Reveal Phase

- [x] revealNext, scoreGuesserPosition, scoreHotSeatPosition
- [x] `RevealScreen` — incremental reveal, category/situation context, points
- [x] Hot seat has Reveal button, others watch
- [x] Verify: incremental reveal, scores, transition

### Phase 6 — Scores, Round Cycling & End

- [x] `ScoresScreen` — round summary, cumulative leaderboard, Next (host)
- [x] `advanceFromScores` — hot seat cycling, round cycling, game end
- [x] 5s auto-advance fallback
- [x] `EndScreen` — final scoreboard, winner, Play Again + Leave Room
- [x] Verify: multi-round full loop, different categories per round, Play Again

### Phase 7 — Polish & Edge Cases

- [x] Disconnect: 60s window, auto-reveal for disconnected hot seat (10s), skip removed, end if <3
- [x] Mobile responsiveness, touch drag-and-drop
- [x] Input validation: name 1-20 chars, ranking/guess payload, phase-gating
- [x] Error toasts, loading/connecting states
- [x] Deployment: Procfile, serve built client from Express, PORT env var

---

## File Structure

```
/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── screens/
│   │   │   │   ├── LandingScreen.jsx
│   │   │   │   ├── LobbyScreen.jsx
│   │   │   │   ├── RankingScreen.jsx
│   │   │   │   ├── GuessingScreen.jsx
│   │   │   │   ├── HotSeatWaitingScreen.jsx
│   │   │   │   ├── RevealScreen.jsx
│   │   │   │   ├── ScoresScreen.jsx
│   │   │   │   └── EndScreen.jsx
│   │   │   └── ui/
│   │   │       └── Timer.jsx
│   │   ├── hooks/
│   │   │   ├── useSocket.js
│   │   │   └── useGameState.js
│   │   ├── context/
│   │   │   └── GameContext.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/
│   ├── index.js
│   ├── roomManager.js
│   ├── gameEngine.js
│   ├── deckManager.js
│   └── package.json
│
├── shared/
│   ├── deck.json
│   └── socketEvents.js
│
├── PLAN.md
└── README.md
```
