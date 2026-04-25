#!/usr/bin/env node
/**
 * Assembles deck.json from generator modules.
 * Validates: 25 cards/set, unique IDs, no duplicate text within set, word count.
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'shared', 'deck.json');

async function loadModule(path) {
  const mod = await import(path);
  return mod.default;
}

async function main() {
  console.log('Loading category modules...');
  const catFiles = [
    './categories-1.mjs', './categories-2.mjs',
    './categories-3.mjs', './categories-4.mjs',
    './categories-5.mjs', './categories-6.mjs',
  ];
  
  const categories = [];
  for (const f of catFiles) {
    try {
      const cats = await loadModule(f);
      categories.push(...cats);
      console.log(`  ${f}: ${cats.length} categories`);
    } catch (e) {
      if (e.code === 'ERR_MODULE_NOT_FOUND') {
        console.log(`  ${f}: not found, skipping`);
      } else { throw e; }
    }
  }

  console.log('Loading situation module...');
  let situations = [];
  try {
    situations = await loadModule('./situations.mjs');
    console.log(`  situations.mjs: ${situations.length} situations`);
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
      console.log('  situations.mjs: not found, skipping');
    } else { throw e; }
  }

  console.log(`\nTotals: ${categories.length} categories, ${situations.length} situations`);

  // Validation
  const errors = [];
  const allIds = new Set();
  const allSets = [...categories, ...situations];

  for (const set of allSets) {
    const label = set.id;
    
    // 25 cards
    if (!set.cards || set.cards.length !== 25) {
      errors.push(`${label}: has ${set.cards?.length ?? 0} cards (need 25)`);
    }

    // Required fields
    if (!set.id) errors.push(`Missing id in a set`);
    if (!set.name) errors.push(`${label}: missing name`);
    if (!set.scale && !set.prompt) errors.push(`${label}: missing scale/prompt`);

    // Card checks
    const textsInSet = new Set();
    for (const card of (set.cards || [])) {
      // Unique ID globally
      if (allIds.has(card.id)) errors.push(`${label}: duplicate ID ${card.id}`);
      allIds.add(card.id);

      // Unique text within set
      const norm = card.text.toLowerCase().trim();
      if (textsInSet.has(norm)) errors.push(`${label}: duplicate text "${card.text}"`);
      textsInSet.add(norm);

      // Word count
      const words = card.text.split(/\s+/).length;
      if (words > 15) errors.push(`${label}/${card.id}: ${words} words "${card.text}"`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} validation errors:`);
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  const deck = { categories, situations };
  writeFileSync(OUT, JSON.stringify(deck, null, 2) + '\n');
  
  const totalCards = allSets.reduce((s, set) => s + set.cards.length, 0);
  console.log(`\n✅ Wrote ${OUT}`);
  console.log(`   ${categories.length} categories + ${situations.length} situations = ${totalCards} cards`);
  console.log(`   ${allIds.size} unique IDs`);
}

main().catch(e => { console.error(e); process.exit(1); });
