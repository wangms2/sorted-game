#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const deck = JSON.parse(readFileSync(join(__dirname, '..', 'shared', 'deck.json'), 'utf-8'));

console.log('Categories:', deck.categories.length);
console.log('Situations:', deck.situations.length);

let totalCards = 0;
const allIds = new Set();
const issues = [];

for (const cat of deck.categories) {
  if (cat.cards.length !== 25) issues.push(`${cat.id} has ${cat.cards.length} cards`);
  for (const c of cat.cards) {
    totalCards++;
    if (allIds.has(c.id)) issues.push(`Duplicate ID: ${c.id}`);
    allIds.add(c.id);
  }
}
for (const sit of deck.situations) {
  if (sit.cards.length !== 25) issues.push(`${sit.id} has ${sit.cards.length} cards`);
  for (const c of sit.cards) {
    totalCards++;
    if (allIds.has(c.id)) issues.push(`Duplicate ID: ${c.id}`);
    allIds.add(c.id);
  }
}

console.log('Total cards:', totalCards);
console.log('Unique IDs:', allIds.size);

// Check consistent prefixes within each set
for (const set of [...deck.categories, ...deck.situations]) {
  const prefixes = new Set(set.cards.map(c => c.id.replace(/_\d+$/, '')));
  if (prefixes.size > 1) issues.push(`${set.id}: mixed prefixes ${[...prefixes].join(', ')}`);
}

if (issues.length > 0) {
  console.log('\nISSUES FOUND:');
  issues.forEach(i => console.log(`  ❌ ${i}`));
  process.exit(1);
} else {
  console.log('No issues found ✅');
  console.log('All IDs unique, consistent prefixes, 25 cards per set ✅');
}
