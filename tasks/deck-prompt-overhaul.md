# Deck Overhaul — Prompts & Personal-Insight Cards

## Problem

Two problems observed in live play:

1. **Ambiguous ranking instruction.** Each deck rendered a title (`name`) plus a separate scale
   line (`scale`/`prompt`). Players had to reconcile two fragments to work out what they were
   ranking. `"Foods & Drinks"` + `"How much you're craving this right now"` — right now, or in
   general? Guessers then guessed against a different question than the hot seat answered.
2. **Wrong kind of content.** Many decks invited an objective or trivia-ish ranking rather than a
   personal one (`"Things Teachers Say"` — *how much you heard this one*).

## Plan

- [x] Unify `categories` + `situations` into a single `decks` array (`id`, `label`, `prompt`,
      `tier`, `cards`)
- [x] Rename the per-player assignment fields `{ name, scale }` → `{ label, prompt }` across
      server, 4 client screens, and the tests
- [x] Write the prompt style guide and mechanically enforce it in the assembler
- [x] Audit the 110 existing decks; prune aggressively
- [x] Author 150 decks (50 deep / 50 mid / 50 light), 25 cards each
- [x] Cross-deck dedupe pass
- [x] Verify: deck build, 237 server tests, client build

## Prompt style guide

Every prompt must be: self-contained (readable without the label); explicit about what "Most"
means; open to one interpretation only; second person; one sentence, ≤ 90 chars.

| Before | After |
|---|---|
| `Foods & Drinks` / *How much you're craving this right now* | **FOODS** / "Rank these foods from your all-time favorite to your least favorite." |
| `Apologies` / *How hard this is to say sorry for* | **APOLOGIES** / "Rank these apologies by how forgiving they would make you feel." |

## Review

**Outcome:** 150 decks, 3,750 cards, tiers exactly 50 deep / 50 mid / 50 light.

**Architecture.** `shared/deck.json` is now generated, never hand-edited. `scripts/deck-gen/`
holds `deck-specs.mjs` (all 150 labels/prompts/tiers, hand-authored in one voice for consistency)
and `decks-01..10.mjs` (cards). `npm run deck:build` assembles and validates in one step.

**Division of labor that worked.** Prompts are the hard part and need a single voice, so all 150
were authored centrally; cards are volume work, so they were parallelised across ten subagents of
fifteen decks each, then reviewed by two QA subagents. The assembler being a hard gate meant every
agent self-corrected before reporting.

**The validator is the real deliverable.** It enforces the style guide mechanically: prompt length,
second-person pronoun, single sentence, no em dash, card ≤ 40 chars, 25 cards per deck, id prefix
matching, within-deck duplicate text, and cross-deck text reuse in more than two decks. That last
check caught 6 genuine collisions ("A hot shower" in three different decks) that no reviewer would
have spotted by eye.

**UI change.** Visual hierarchy inverted: the deck label is now a small uppercase kicker and the
prompt is the prominent line, since the prompt is the information the player actually needs.

**Verification.** `npm run deck:build` clean; all 8 server test suites pass (237 assertions);
client builds and `client/dist` rebuilt with the renamed fields.

**Follow-ups deliberately left out of scope:** per-deck custom axis labels (the ⬆ Most / ⬇ Least
labels are hardcoded in `RankingScreen.jsx`) and a content/spice toggle.

**Post-review cleanup.** An independent code review found no correctness bugs but flagged two
vestiges of the old category/situation split, both since removed: `room.roundType` (always `null`,
yet still sent to every client) and the unused `decksById` export in `deckManager.js`. An
independent content audit fixed two ungrammatical prompts (`being_known`, `family`) and flagged a
"sleeping pill" card that broke the no-drugs rule, also since replaced.
