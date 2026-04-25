# Deck Quality Overhaul — Execution Plan

## Goal
Rebuild deck.json with 80 categories (up from 30) + 30 cleaned situations. All cards must be concise (≤10 words ideal, 15 max), unique within their set, personality-revealing, and free of AI-verbose patterns.

## Critical Constraint: Response Length Limit
deck.json is ~6,400 lines. The new file will be ~14,000+ lines (80 cats × 25 cards + 30 sits × 25 cards = 2,750 cards). **We cannot write this in one shot.**

### Strategy: Build via Node.js generator scripts
Instead of writing JSON directly, we write small Node.js scripts that each output a portion of the deck, then a final assembler script combines them. Each script is ~200-400 lines (well within limits), and the terminal executes them to produce the large JSON output.

```
scripts/deck-gen/
  categories-1.mjs    # Categories 1-16 (existing, cleaned)
  categories-2.mjs    # Categories 17-30 (existing, cleaned)  
  categories-3.mjs    # Categories 31-46 (new)
  categories-4.mjs    # Categories 47-55 (new)
  categories-5.mjs    # Categories 56-65 (new)
  categories-6.mjs    # Categories 66-80 (new)
  situations.mjs      # All 30 situations (cleaned)
  assemble.mjs        # Reads all parts, validates, writes deck.json
```

Each generator exports an array of category/situation objects. The assembler combines, validates (25 cards each, unique IDs, no dup text), and writes final JSON.

---

## Phases

### Phase 1: Infrastructure
- Create `assemble.mjs` with validation (25 cards/set, unique IDs, no dup text within set, word count check)

### Phase 2: Clean existing 30 categories (categories-1.mjs + categories-2.mjs)
For each: fix scales, remove dupes, replace with fresh ideas, strip AI-verbose patterns

### Phase 3: Write 50 new categories (categories-3 through 6)
~10 categories per file to stay within limits

### Phase 4: Clean 30 situations (situations.mjs)
Remove 4 problematic ones (off_grid, survival_skills, zombie, desert_island), replace with 4 new personality-revealing situations. Fix all dupes and AI-voice in remaining 26.

### Phase 5: Assemble, validate, test

## Key Quality Rules for All Cards
1. ≤10 words ideal, 15 word hard max
2. No "that actually", "even if", "somehow", "especially when" qualifiers
3. No parenthetical asides like "(future you says thanks)"
4. No "really good/nice/great" vague qualifiers  
5. Every card in a set must represent a distinct idea
6. Cards should produce subjective (personality-revealing) rankings, not objective ones
7. Scales must be ≤8 words, immediately clear
