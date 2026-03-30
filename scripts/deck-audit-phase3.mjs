#!/usr/bin/env node
/**
 * Deck Audit — Phase 3
 * Fix card-prompt mismatches:
 *   - Meditation Retreat cards 11-25: were retreat amenities, should be things you'd give up
 *   - Dinner Party cards 11-25: were fantasy guests, should be dinner party factors
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const deckPath = join(__dirname, '..', 'shared', 'deck.json');
const deck = JSON.parse(readFileSync(deckPath, 'utf-8'));

// ── Meditation Retreat: replace cards 11-25 ─────────────────────
// Prompt: "Two weeks of silence — rank what you'd struggle to give up"
// Cards 1-10 are good (phone, music, friends, coffee, TV...). Cards 11-25 need rewriting.
const meditationReplacements = [
  { idx: 10, text: "Social media — mindless scrolling is a coping mechanism" },
  { idx: 11, text: "Podcasts — you listen during literally everything" },
  { idx: 12, text: "Snacking whenever the mood strikes" },
  { idx: 13, text: "Your own bed — retreat beds are a different experience" },
  { idx: 14, text: "Background noise — always having something playing" },
  { idx: 15, text: "Complaining out loud about small things" },
  { idx: 16, text: "Sarcasm — your primary love language" },
  { idx: 17, text: "A glass of wine at the end of the day" },
  { idx: 18, text: "Your pet" },
  { idx: 19, text: "Group chats — they'll move on without you" },
  { idx: 20, text: "Choosing what to eat for every meal" },
  { idx: 21, text: "Hot showers whenever you want" },
  { idx: 22, text: "Checking the time every five minutes" },
  { idx: 23, text: "Venting to someone when something goes wrong" },
  { idx: 24, text: "Wearing whatever you want" },
];

const medSit = deck.situations.find(s => s.id === 'sit_meditation_retreat');
if (!medSit) throw new Error('sit_meditation_retreat not found');

for (const rep of meditationReplacements) {
  const card = medSit.cards[rep.idx];
  const oldText = card.text;
  card.text = rep.text;
  console.log(`  med[${rep.idx}] (${card.id}): "${oldText}" → "${rep.text}"`);
}
console.log(`\nMeditation Retreat: replaced ${meditationReplacements.length} cards\n`);

// ── Dinner Party: replace cards 11-25 ───────────────────────────
// Prompt: "Rank what matters most for the perfect dinner"
// Cards 1-10 are good (food, people, music, ambiance...). Cards 11-25 need rewriting.
const dinnerReplacements = [
  { idx: 10, text: "A signature cocktail or welcome drink" },
  { idx: 11, text: "Everyone arriving on time — or at least close" },
  { idx: 12, text: "A dessert that people talk about the next day" },
  { idx: 13, text: "A theme that ties the whole evening together" },
  { idx: 14, text: "Someone volunteering to help clean up after" },
  { idx: 15, text: "The host actually sitting down and enjoying it too" },
  { idx: 16, text: "Enough room for everyone to mingle" },
  { idx: 17, text: "Enough food that no one leaves hungry" },
  { idx: 18, text: "A surprise dish that catches everyone off guard" },
  { idx: 19, text: "A toast that makes everyone laugh" },
  { idx: 20, text: "Games or activities after the meal" },
  { idx: 21, text: "Fresh flowers or candles on the table" },
  { idx: 22, text: "A friend who brings something without being asked" },
  { idx: 23, text: "Not talking about work the entire time" },
  { idx: 24, text: "The night ending naturally — no awkward goodbyes" },
];

const dinSit = deck.situations.find(s => s.id === 'sit_dinner_party');
if (!dinSit) throw new Error('sit_dinner_party not found');

for (const rep of dinnerReplacements) {
  const card = dinSit.cards[rep.idx];
  const oldText = card.text;
  card.text = rep.text;
  console.log(`  dinner[${rep.idx}] (${card.id}): "${oldText}" → "${rep.text}"`);
}
console.log(`\nDinner Party: replaced ${dinnerReplacements.length} cards\n`);

// ── Write back ──────────────────────────────────────────────────
writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n');
console.log('✅ deck.json updated');
