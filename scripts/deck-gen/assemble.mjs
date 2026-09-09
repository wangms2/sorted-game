#!/usr/bin/env node
/**
 * Assembles shared/deck.json from deck-specs.mjs (labels/prompts/tiers)
 * plus decks-*.mjs card modules (25 cards per deck id).
 *
 * Enforces the prompt style guide and card constraints. Exits non-zero on any
 * violation so this doubles as the deck validator.
 */
import { writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DECK_SPECS } from './deck-specs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'shared', 'deck.json');

const MAX_CARD_CHARS = 40;
const MAX_PROMPT_CHARS = 90;
const CARDS_PER_DECK = 25;
const MIN_DECKS = 150;
const TIERS = new Set(['deep', 'mid', 'light']);

async function loadCards() {
    const files = readdirSync(__dirname)
        .filter((f) => /^decks-.*\.mjs$/.test(f))
        .sort();
    const cardsByDeck = new Map();
    const errors = [];
    for (const f of files) {
        const mod = await import(`./${f}`);
        const entries = mod.default;
        if (!entries || typeof entries !== 'object') {
            errors.push(`${f}: default export must be an object keyed by deck id`);
            continue;
        }
        for (const [deckId, cards] of Object.entries(entries)) {
            if (cardsByDeck.has(deckId)) {
                errors.push(`${f}: deck "${deckId}" already defined in another module`);
                continue;
            }
            cardsByDeck.set(deckId, cards);
        }
    }
    return { cardsByDeck, errors, files };
}

function validatePrompt(spec, errors) {
    const { id, prompt, label, tier } = spec;
    if (!label) errors.push(`${id}: missing label`);
    if (!TIERS.has(tier)) errors.push(`${id}: tier must be deep|mid|light, got "${tier}"`);
    if (!prompt) {
        errors.push(`${id}: missing prompt`);
        return;
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
        errors.push(`${id}: prompt is ${prompt.length} chars (max ${MAX_PROMPT_CHARS})`);
    }
    if (!/\b(you|your|yourself)\b/i.test(prompt)) {
        errors.push(`${id}: prompt must be second person: "${prompt}"`);
    }
    if (!/[.?]$/.test(prompt)) {
        errors.push(`${id}: prompt must end in a period or question mark: "${prompt}"`);
    }
    // Single sentence: no internal sentence-ending punctuation, no em-dash splices.
    if (/[.?!]\s/.test(prompt) || prompt.includes('—') || prompt.includes(';')) {
        errors.push(`${id}: prompt must be a single sentence with no em dash: "${prompt}"`);
    }
}

function validateCards(spec, cards, allCardIds, errors) {
    const { id } = spec;
    if (!Array.isArray(cards)) {
        errors.push(`${id}: no cards defined`);
        return 0;
    }
    if (cards.length !== CARDS_PER_DECK) {
        errors.push(`${id}: has ${cards.length} cards (need ${CARDS_PER_DECK})`);
    }
    const seenText = new Set();
    for (const card of cards) {
        if (!card || typeof card !== 'object' || !card.id || !card.text) {
            errors.push(`${id}: card missing id or text: ${JSON.stringify(card)}`);
            continue;
        }
        if (allCardIds.has(card.id)) errors.push(`${id}: duplicate card id ${card.id}`);
        allCardIds.add(card.id);
        if (!card.id.startsWith(`${id}_`)) {
            errors.push(`${id}: card id "${card.id}" must start with "${id}_"`);
        }
        if (card.text.length > MAX_CARD_CHARS) {
            errors.push(`${id}: card is ${card.text.length} chars (max ${MAX_CARD_CHARS}): "${card.text}"`);
        }
        const norm = card.text.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenText.has(norm)) errors.push(`${id}: duplicate card text "${card.text}"`);
        seenText.add(norm);
    }
    return cards.length;
}

async function main() {
    const { cardsByDeck, errors, files } = await loadCards();
    console.log(`Loaded ${files.length} card modules covering ${cardsByDeck.size} decks.`);

    const allCardIds = new Set();
    const seenDeckIds = new Set();
    const decks = [];
    let totalCards = 0;

    for (const spec of DECK_SPECS) {
        if (seenDeckIds.has(spec.id)) errors.push(`duplicate deck id ${spec.id}`);
        seenDeckIds.add(spec.id);
        validatePrompt(spec, errors);
        const cards = cardsByDeck.get(spec.id);
        totalCards += validateCards(spec, cards, allCardIds, errors);
        decks.push({ id: spec.id, label: spec.label, prompt: spec.prompt, tier: spec.tier, cards: cards || [] });
    }

    for (const deckId of cardsByDeck.keys()) {
        if (!seenDeckIds.has(deckId)) errors.push(`cards defined for unknown deck "${deckId}"`);
    }

    if (decks.length < MIN_DECKS) errors.push(`only ${decks.length} decks (need at least ${MIN_DECKS})`);

    // Cross-deck duplicate card text (same phrase reused in many decks reads as filler).
    const textToDecks = new Map();
    for (const deck of decks) {
        for (const card of deck.cards) {
            const norm = card.text.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!textToDecks.has(norm)) textToDecks.set(norm, []);
            textToDecks.get(norm).push(deck.id);
        }
    }
    const collisions = [...textToDecks.entries()].filter(([, ds]) => ds.length > 2);
    for (const [text, ds] of collisions) {
        errors.push(`card text repeated in ${ds.length} decks (${ds.join(', ')}): "${text}"`);
    }

    const tierCounts = decks.reduce((acc, d) => ({ ...acc, [d.tier]: (acc[d.tier] || 0) + 1 }), {});

    if (errors.length > 0) {
        console.error(`\n${errors.length} validation errors:`);
        errors.slice(0, 80).forEach((e) => console.error(`  - ${e}`));
        if (errors.length > 80) console.error(`  ... and ${errors.length - 80} more`);
        process.exit(1);
    }

    writeFileSync(OUT, `${JSON.stringify({ decks }, null, 2)}\n`);
    console.log(`\nWrote ${OUT}`);
    console.log(`   ${decks.length} decks, ${totalCards} cards, ${allCardIds.size} unique card ids`);
    console.log(`   tiers: ${JSON.stringify(tierCounts)}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
