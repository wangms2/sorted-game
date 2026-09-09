import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const deckPath = join(__dirname, '..', 'shared', 'deck.json');
const deckData = JSON.parse(readFileSync(deckPath, 'utf8'));

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
            && !room.players[id].guesserOnly && !room.players[id].pendingMidGameChoice
    );
    const numPlayers = playerIds.length;

    // Draw from the decks not yet used in this game
    let pool = shuffle(deckData.decks.filter((d) => !room.usedDeckIds.includes(d.id)));

    // Fallback: if not enough unused, allow reuse from the full deck
    if (pool.length < numPlayers) {
        pool = shuffle([...deckData.decks]);
    }

    const selected = pool.slice(0, numPlayers);

    playerIds.forEach((socketId, i) => {
        const entry = selected[i];
        const cards = shuffle(entry.cards).slice(0, 5).sort((a, b) => a.id.localeCompare(b.id));

        room.players[socketId].assignment = {
            id: entry.id,
            label: entry.label,
            prompt: entry.prompt,
            tier: entry.tier,
        };
        room.players[socketId].cards = cards;
        room.players[socketId].ranking = null;
        room.players[socketId].hasRanked = false;
        room.players[socketId].currentGuess = null;
        room.players[socketId].draftGuess = null;
        room.players[socketId].draftRanking = null;
        room.players[socketId].hasGuessed = false;

        room.usedDeckIds.push(entry.id);
    });
}

export { deckData, shuffle };
