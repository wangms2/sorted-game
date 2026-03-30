#!/usr/bin/env node
/**
 * Deck Audit — Phase 5: Normalize ID prefixes
 * Use abbreviated prefix (from cards 1-10) for all 25 cards.
 * e.g., foods_011 → food_011, sit_desert_island_011 → sit_island_011
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const deckPath = join(__dirname, '..', 'shared', 'deck.json');
const deck = JSON.parse(readFileSync(deckPath, 'utf-8'));

let totalRenames = 0;

function normalizeIds(sets, label) {
  for (const set of sets) {
    // Extract the abbreviated prefix from card 1 (index 0)
    const first = set.cards[0];
    const match = first.id.match(/^(.+)_(\d+)$/);
    if (!match) {
      console.log(`  ⚠ ${set.id}: cannot parse card ID ${first.id}`);
      continue;
    }
    const abbrevPrefix = match[1]; // e.g., "food" or "sit_island"
    
    let setRenames = 0;
    for (const card of set.cards) {
      const cm = card.id.match(/^(.+)_(\d+)$/);
      if (!cm) continue;
      const [, currentPrefix, num] = cm;
      if (currentPrefix !== abbrevPrefix) {
        const oldId = card.id;
        card.id = `${abbrevPrefix}_${num}`;
        setRenames++;
      }
    }
    
    if (setRenames > 0) {
      console.log(`  ${set.id}: ${abbrevPrefix}_* (${setRenames} renamed)`);
      totalRenames += setRenames;
    }
  }
}

console.log('=== Categories ===');
normalizeIds(deck.categories, 'category');

console.log('\n=== Situations ===');
normalizeIds(deck.situations, 'situation');

console.log(`\n✅ Normalized ${totalRenames} card IDs to abbreviated prefix`);

writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n');
console.log('✅ deck.json updated');
