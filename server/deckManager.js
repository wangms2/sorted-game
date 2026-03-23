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

    // Decide round type: roughly alternate, starting with category
    const isCategory = room.currentRoundNumber % 2 === 1;
    room.roundType = isCategory ? 'category' : 'situation';

    if (isCategory) {
        // Pick N unused categories
        const available = deckData.categories.filter(
            (c) => !room.usedCategoryIds.includes(c.id)
        );
        // Fallback: if not enough unused, allow reuse
        const pool = available.length >= numPlayers
            ? shuffle(available).slice(0, numPlayers)
            : shuffle([...deckData.categories]).slice(0, numPlayers);

        playerIds.forEach((socketId, i) => {
            const cat = pool[i];
            const cards = shuffle(cat.cards).slice(0, 5);
            room.players[socketId].assignment = {
                type: 'category',
                id: cat.id,
                name: cat.name,
                scale: cat.scale,
            };
            room.players[socketId].cards = cards;
            room.players[socketId].ranking = null;
            room.players[socketId].hasRanked = false;
            room.players[socketId].currentGuess = null;
            room.players[socketId].hasGuessed = false;
            room.usedCategoryIds.push(cat.id);
        });
    } else {
        // Pick N unused situations
        const available = deckData.situations.filter(
            (s) => !room.usedSituationIds.includes(s.id)
        );
        const pool = available.length >= numPlayers
            ? shuffle(available).slice(0, numPlayers)
            : shuffle([...deckData.situations]).slice(0, numPlayers);

        playerIds.forEach((socketId, i) => {
            const sit = pool[i];
            const cards = shuffle(sit.cards).slice(0, 5);
            room.players[socketId].assignment = {
                type: 'situation',
                id: sit.id,
                name: sit.name,
                scale: sit.prompt,
            };
            room.players[socketId].cards = cards;
            room.players[socketId].ranking = null;
            room.players[socketId].hasRanked = false;
            room.players[socketId].currentGuess = null;
            room.players[socketId].hasGuessed = false;
            room.usedSituationIds.push(sit.id);
        });
    }
}

export { deckData, categoriesById, situationsById, shuffle };
