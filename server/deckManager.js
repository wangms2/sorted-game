import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const deckPath = join(__dirname, '..', 'shared', 'deck.json');
const deckData = JSON.parse(readFileSync(deckPath, 'utf8'));

const categoriesById = new Map();
for (const cat of deckData.categories) {
    categoriesById.set(cat.id, cat);
}

const situationsById = new Map();
for (const sit of deckData.situations) {
    situationsById.set(sit.id, sit);
}

function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function dealRound(room) {
    const playerIds = room.playerOrder.filter(
        (id) => room.players[id] && room.players[id].connected
    );
    const numPlayers = playerIds.length;

    // Build a combined pool of all unused categories and situations
    const availableCats = deckData.categories.filter(
        (c) => !room.usedCategoryIds.includes(c.id)
    );
    const availableSits = deckData.situations.filter(
        (s) => !room.usedSituationIds.includes(s.id)
    );
    let pool = shuffle([...availableCats, ...availableSits]);

    // Fallback: if not enough unused, allow reuse from full deck
    if (pool.length < numPlayers) {
        pool = shuffle([...deckData.categories, ...deckData.situations]);
    }

    const selected = pool.slice(0, numPlayers);

    playerIds.forEach((socketId, i) => {
        const entry = selected[i];
        const isCategory = entry.scale !== undefined; // categories have 'scale', situations have 'prompt'
        const cards = shuffle(entry.cards).slice(0, 5);

        room.players[socketId].assignment = {
            type: isCategory ? 'category' : 'situation',
            id: entry.id,
            name: entry.name,
            scale: isCategory ? entry.scale : entry.prompt,
        };
        room.players[socketId].cards = cards;
        room.players[socketId].ranking = null;
        room.players[socketId].hasRanked = false;
        room.players[socketId].currentGuess = null;
        room.players[socketId].hasGuessed = false;

        if (isCategory) {
            room.usedCategoryIds.push(entry.id);
        } else {
            room.usedSituationIds.push(entry.id);
        }
    });
}

export { deckData, categoriesById, situationsById, shuffle };
