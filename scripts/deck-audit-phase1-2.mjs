#!/usr/bin/env node
/**
 * Deck Audit — Phase 1 & 2
 * Rewrites situation prompts (concise, drop redundant scenario) 
 * and tightens category scales.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const deckPath = join(__dirname, '..', 'shared', 'deck.json');

const deck = JSON.parse(readFileSync(deckPath, 'utf-8'));

// ── Phase 1: Situation prompt rewrites ──────────────────────────
const promptRewrites = {
  sit_tiny_apartment:     "Rank what you'd give up last",
  sit_desert_island:      "Stranded for a month — rank what you'd want most",
  // sit_apocalypse: KEEP
  sit_meditation_retreat: "Two weeks of silence — rank what you'd struggle to give up",
  sit_10k_windfall:       "All on yourself — rank what you'd spend it on first",
  sit_new_city:           "Rank what would help you feel at home fastest",
  sit_perfect_saturday:   "Zero obligations — rank how you'd spend it",
  sit_eliminate_forever:  "Rank what you'd be most willing to live without",
  sit_dinner_party:       "Rank what matters most for the perfect dinner",
  sit_off_grid:           "Fully off-grid for a month — rank what you'd miss most",
  // sit_last_meal: KEEP
  sit_dream_home:         "Rank what you'd prioritize first",
  sit_month_off:          "Full pay, no plans — rank how you'd spend it",
  sit_looking_back:       "Rank what you'd be most glad you did",
  sit_two_suitcases:      "Moving abroad — rank what makes the cut",
  sit_one_hour:           "Rank how you'd spend it",
  sit_terrible_week:      "Rank what would help you recover most",
  sit_long_flight:        "Rank what would make it bearable",
  sit_fame:               "Rank which kind of fame sounds best",
  sit_retirement:         "Rank what you'd want most",
  sit_zombie:             "It's started — rank what you'd grab first",
  // sit_time_travel: KEEP
  // sit_superpower_catch: KEEP
  sit_bank_heist:         "Rank who you'd recruit first",
  sit_dating_profile:     "Rank what you'd highlight about yourself",
  sit_talent_show:        "Rank what you'd be most willing to perform",
  sit_roommate:           "Rank what matters most in a roommate",
  sit_survival_skills:    "Rank which skill you'd want most",
  sit_billionaire_day:    "One day only — rank what you'd do first",
  sit_school_subjects:    "Rank which subject you'd actually enjoy again",
};

let promptChanges = 0;
for (const sit of deck.situations) {
  if (promptRewrites[sit.id]) {
    const old = sit.prompt;
    sit.prompt = promptRewrites[sit.id];
    console.log(`  ✓ ${sit.id}: "${old}" → "${sit.prompt}"`);
    promptChanges++;
  }
}
console.log(`\nPhase 1: Rewrote ${promptChanges} situation prompts\n`);

// ── Phase 2: Category scale tightening ──────────────────────────
const scaleRewrites = {
  morning_routines: "How essential this is to your morning",
  milestones:       "How much this milestone means to you",
  wfh:              "How much you'd miss this at the office",
};

let scaleChanges = 0;
for (const cat of deck.categories) {
  if (scaleRewrites[cat.id]) {
    const old = cat.scale;
    cat.scale = scaleRewrites[cat.id];
    console.log(`  ✓ ${cat.id}: "${old}" → "${cat.scale}"`);
    scaleChanges++;
  }
}
console.log(`\nPhase 2: Rewrote ${scaleChanges} category scales\n`);

// ── Write back ──────────────────────────────────────────────────
writeFileSync(deckPath, JSON.stringify(deck, null, 2) + '\n');
console.log('✅ deck.json updated');
