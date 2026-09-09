# Card Authoring Guide

Cards are the items players drag into a ranked order. Each deck has exactly **25 cards**;
five are dealt at random per player per round.

## The game's purpose

Sorted is about **learning about your friends**. A player ranks their own five cards, and
everyone else tries to guess that exact ranking. A deck only works if a friend's ranking
would actually **teach you something about them**.

## Hard constraints (enforced by `assemble.mjs`)

- Exactly 25 cards per deck.
- Card text is **≤ 40 characters**. Target 2–5 words.
- Card ids are `<deck_id>_01` … `<deck_id>_25`, zero-padded, globally unique.
- No duplicate card text within a deck.
- No card text repeated in more than two decks across the whole set.

## Card writing rules

1. **Concise and concrete.** A player reads five cards and ranks them in under a minute.
   "Tacos" beats "A really good taco from that place downtown." Simplicity wins.
2. **Spread, not consensus.** Every card must be plausibly someone's #1 *and* plausibly
   someone's #5. If a card is obviously the best or obviously the worst for everyone,
   the deck teaches nothing and the guessing is trivial. This is the single most
   important rule.
3. **No objectively correct answer.** Never write cards that reward trivia, recall, or
   exposure ("how much you heard this one"). Rank preference, never fact.
4. **Answer the prompt.** Every card must be a grammatical, sensible completion of that
   deck's prompt. Read the prompt, then read the card, and check it parses.
5. **Same grammatical shape within a deck.** All noun phrases, or all verb phrases — not
   a mix. Ranking is much harder when cards don't read in parallel.
6. **Friend-and-family safe.** No sex, no drugs, no heavy trauma, no politics or religion
   as a wedge. Deep is fine; distressing is not. "What you'd want people to say about you"
   is deep. Grief and abuse are out of scope.
7. **Second person implied.** Cards are about the player. Avoid "people" and "society".
8. **No brand-heavy or dated references** unless the deck is explicitly about them
   (e.g. Nostalgia, Apps). Avoid anything that will read as stale in two years.
9. **Distinct within the deck.** Twenty-five cards should cover meaningfully different
   ground, not twenty-five rewordings of three ideas.

## Bad vs. good

| Bad | Why | Good |
|---|---|---|
| `A really good taco from a truck` | Too long and over-described | `Tacos` |
| `Winning the lottery` (in Small Wins) | Not plausibly anyone's #5 | `Finding cash in an old coat` |
| `Being a good person` (in Values) | Nobody ranks this low; no spread | `Loyalty` |
| `Liking a 3-year-old Instagram post` | Recall-flavored, over-specific | `Texting the wrong person` |

## Module format

Write one file, `scripts/deck-gen/decks-NN.mjs`, default-exporting an object keyed by deck id:

```js
export default {
  foods: [
    { id: 'foods_01', text: 'Tacos' },
    // ... 25 total
  ],
  cuisines: [
    { id: 'cuisines_01', text: 'Italian' },
    // ... 25 total
  ],
};
```

## Verifying

From the repo root, run `npm run deck:build`. It assembles `shared/deck.json` and fails
with a list of violations if anything breaks the constraints above.
