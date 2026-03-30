#!/usr/bin/env node
/**
 * Deck Audit — Phase 4: Deduplication
 * Replace duplicate/near-duplicate cards with fresh unique content.
 * Strategy: keep the cleaner version (usually cards 1-10), replace the dupe.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const deckPath = join(__dirname, '..', 'shared', 'deck.json');
const deck = JSON.parse(readFileSync(deckPath, 'utf-8'));

// Helper: find a category or situation by id
const findSet = (id) =>
  deck.categories.find(c => c.id === id) || deck.situations.find(s => s.id === id);

// Helper: find a card by id within a set and replace its text
const replaceCard = (setId, cardId, newText) => {
  const set = findSet(setId);
  if (!set) throw new Error(`Set ${setId} not found`);
  const card = set.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} not found in ${setId}`);
  const old = card.text;
  card.text = newText;
  console.log(`  ${cardId}: "${old}" → "${newText}"`);
};

// ── CATEGORIES ──────────────────────────────────────────────────

console.log('\n--- holidays ---');
// hol_010 "The midnight countdown on New Year's Eve" ≈ holidays_012 "The countdown to midnight on New Year's Eve"
replaceCard('holidays', 'holidays_012', "Secret Santa — the thrill of nailing someone's gift");

console.log('\n--- smells ---');
// smell_008 = smells_021 "A bakery you walk past on the street" (exact dup)
replaceCard('smells', 'smells_021', 'Old books in a used bookstore');

console.log('\n--- upgrades ---');
// upg_009 "Always knowing exactly what to say" ≈ upgrades_022 "No more awkward silences..."
replaceCard('upgrades', 'upgrades_022', 'A body that heals twice as fast');

console.log('\n--- fashion ---');
// fash_002 "Brand new white sneakers" ≈ fashion_012 "White sneakers that go with everything"
replaceCard('fashion', 'fashion_012', 'A tailored blazer that fits perfectly');

console.log('\n--- party_games ---');
// party_006 "Mafia or Werewolf" ≈ party_games_013 "Mafia or Werewolf — the accusations fly"
replaceCard('party_games', 'party_games_013', 'Trivia that gets surprisingly competitive');

// ── SITUATIONS ──────────────────────────────────────────────────

console.log('\n--- sit_eliminate_forever ---');
// sit_elim_008 = sit_eliminate_forever_013 "Hangovers" (exact dup)
replaceCard('sit_eliminate_forever', 'sit_eliminate_forever_013', 'Small talk with strangers');

console.log('\n--- sit_superpower_catch ---');
// sit_spow_002 ≈ sit_superpower_catch_012 (read minds)
replaceCard('sit_superpower_catch', 'sit_superpower_catch_012', "You can stop time, but everything smells terrible when frozen");
// sit_spow_001 ≈ sit_superpower_catch_011 (fly)
replaceCard('sit_superpower_catch', 'sit_superpower_catch_011', "You can breathe underwater, but you're terrified of fish");
// sit_spow_009 ≈ sit_superpower_catch_017 (talk to animals)
replaceCard('sit_superpower_catch', 'sit_superpower_catch_017', 'You can control the weather, but it matches your mood');

console.log('\n--- sit_bank_heist ---');
// tech genius: sit_heist_001 ≈ sit_bank_heist_011
replaceCard('sit_bank_heist', 'sit_bank_heist_011', 'The forger who can fake any document');
// smooth talker: sit_heist_002 ≈ sit_bank_heist_019
replaceCard('sit_bank_heist', 'sit_bank_heist_019', 'The lookout who never misses a detail');
// getaway driver: sit_heist_003 ≈ sit_bank_heist_013
replaceCard('sit_bank_heist', 'sit_bank_heist_013', 'The ex-cop who knows how they think');
// muscle: sit_heist_005 ≈ sit_bank_heist_016
replaceCard('sit_bank_heist', 'sit_bank_heist_016', "The clean-up crew — they make it like it never happened");
// disguise: sit_heist_006 ≈ sit_bank_heist_014
replaceCard('sit_bank_heist', 'sit_bank_heist_014', 'The voice actor who can mimic anyone on a phone call');

console.log('\n--- sit_talent_show ---');
// singing: sit_talent_001 ≈ sit_talent_show_015
replaceCard('sit_talent_show', 'sit_talent_show_015', 'A dramatic reading of a famous speech');
// dance: sit_talent_003 ≈ sit_talent_show_012
replaceCard('sit_talent_show', 'sit_talent_show_012', "A hula hoop act that's somehow mesmerizing");
// impressions: sit_talent_005 ≈ sit_talent_show_011
replaceCard('sit_talent_show', 'sit_talent_show_011', 'Speed painting — finishing a portrait in under 3 minutes');
// magic trick: sit_talent_007 ≈ sit_talent_show_014
replaceCard('sit_talent_show', 'sit_talent_show_014', 'A ventriloquist act that actually creeps people out');

console.log('\n--- sit_roommate ---');
// quiet hours: sit_room_002 ≈ sit_roommate_012
replaceCard('sit_roommate', 'sit_roommate_012', 'Warns you before having people over');
// food: sit_room_004 ≈ sit_roommate_017
replaceCard('sit_roommate', 'sit_roommate_017', "Doesn't hog the bathroom in the morning");
// space: sit_room_006 ≈ sit_roommate_014
replaceCard('sit_roommate', 'sit_roommate_014', 'Has a similar cleanliness standard');
// strangers: sit_room_007 ≈ sit_roommate_019
replaceCard('sit_roommate', 'sit_roommate_019', 'Remembers to lock the door at night');

console.log('\n--- sit_survival_skills (10 replacements) ---');
// All 10 cards 1-10 have near-dups in 11-25. Keep 1-10, replace their counterparts.
// fire (002 ≈ 011)
replaceCard('sit_survival_skills', 'sit_survival_skills_011', 'Foraging for mushrooms safely');
// plants (003 ≈ 012)
replaceCard('sit_survival_skills', 'sit_survival_skills_012', 'Fishing with improvised gear');
// traps (006 ≈ 013)
replaceCard('sit_survival_skills', 'sit_survival_skills_013', 'Climbing trees quickly to escape danger');
// stars (004 ≈ 014)
replaceCard('sit_survival_skills', 'sit_survival_skills_014', 'Making rope from plant fibers');
// shelter (001 ≈ 015)
replaceCard('sit_survival_skills', 'sit_survival_skills_015', 'Preserving food by smoking or drying');
// water (005 ≈ 016)
replaceCard('sit_survival_skills', 'sit_survival_skills_016', 'Building a raft to cross water');
// first aid (007 ≈ 017)
replaceCard('sit_survival_skills', 'sit_survival_skills_017', 'Reading terrain to find the safest path');
// swimming (008 ≈ 018)
replaceCard('sit_survival_skills', 'sit_survival_skills_018', 'Knowing which insects are safe to eat');
// knots (010 ≈ 020)
replaceCard('sit_survival_skills', 'sit_survival_skills_020', "Camouflaging yourself from predators");
// calm (009 ≈ 023)
replaceCard('sit_survival_skills', 'sit_survival_skills_023', "Digging for water when there's no stream nearby");

// ── SUMMARY ─────────────────────────────────────────────────────
const totalReplacements = 5 + 1 + 3 + 5 + 4 + 4 + 10; // categories + situations
console.log(`\n✅ Replaced ${totalReplacements} duplicate/near-duplicate cards\n`);

writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n');
console.log('✅ deck.json updated');
