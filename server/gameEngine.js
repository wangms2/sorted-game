import { dealRound, shuffle } from './deckManager.js';

const timers = new Map(); // roomCode -> timeoutId

function clearRoomTimer(roomCode) {
    const timerId = timers.get(roomCode);
    if (timerId) {
        clearTimeout(timerId);
        timers.delete(roomCode);
    }
}

function setRoomTimer(room, durationSeconds, callback) {
    clearRoomTimer(room.code);
    room.timerEndAt = Date.now() + durationSeconds * 1000;
    const timerId = setTimeout(() => {
        timers.delete(room.code);
        room.timerEndAt = null;
        callback();
    }, durationSeconds * 1000);
    timers.set(room.code, timerId);
}

export function startGame(room, totalRounds, io, emitRoomUpdate) {
    const connectedPlayers = Object.values(room.players).filter((p) => p.connected);
    if (connectedPlayers.length < 2) {
        return { error: 'Need at least 2 players to start' };
    }
    if (totalRounds < 1 || totalRounds > 3) {
        return { error: 'Rounds must be between 1 and 3' };
    }

    room.mode = connectedPlayers.length === 2 ? 'coop' : 'competitive';
    room.totalRounds = totalRounds;
    room.currentRoundNumber = 1;
    room.hotSeatIndex = 0;
    room.usedCategoryIds = [];
    room.usedSituationIds = [];

    // Reset all scores
    for (const player of Object.values(room.players)) {
        player.score = 0;
    }

    dealRound(room);
    room.phase = 'ranking';

    setRoomTimer(room, room.settings.rankingTimerSeconds, () => {
        handleRankingTimeout(room, io, emitRoomUpdate);
    });

    return {};
}

export function submitRanking(room, socketId, ranking) {
    if (room.phase !== 'ranking') return { error: 'Not in ranking phase' };
    if (!Array.isArray(ranking)) return { error: 'Invalid ranking format' };

    const player = room.players[socketId];
    if (!player) return { error: 'Player not found' };
    if (player.hasRanked) return { error: 'Already submitted ranking' };

    // Validate ranking contains exactly the player's card IDs
    const playerCardIds = player.cards.map((c) => c.id).sort();
    const rankingIds = [...ranking].sort();
    if (
        ranking.length !== playerCardIds.length ||
        !rankingIds.every((id, i) => id === playerCardIds[i])
    ) {
        return { error: 'Invalid ranking: must contain exactly your dealt cards' };
    }

    player.ranking = ranking;
    player.hasRanked = true;

    return {};
}

export function checkAllRanked(room, io, emitRoomUpdate) {
    const allRanked = Object.values(room.players)
        .filter((p) => p.connected)
        .every((p) => p.hasRanked);

    if (allRanked) {
        clearRoomTimer(room.code);
        room.timerEndAt = null;
        startGuessingPhase(room, io, emitRoomUpdate);
        return true;
    }
    return false;
}

function handleRankingTimeout(room, io, emitRoomUpdate) {
    // Auto-submit for players who haven't ranked
    for (const player of Object.values(room.players)) {
        if (!player.hasRanked && player.connected) {
            player.ranking = player.cards.map((c) => c.id); // default order
            player.hasRanked = true;
        }
    }
    room.timerEndAt = null;
    startGuessingPhase(room, io, emitRoomUpdate);
}

export function startGuessingPhase(room, io, emitRoomUpdate) {
    const hotSeatPlayerId = room.playerOrder[room.hotSeatIndex];
    const hotSeatPlayer = room.players[hotSeatPlayerId];

    if (!hotSeatPlayer || !hotSeatPlayer.connected) {
        // Skip disconnected hot seat players
        if (advanceHotSeat(room, io, emitRoomUpdate)) return;
        // If no more players, handled by advanceHotSeat
        return;
    }

    room.phase = 'guessing';
    room.hotSeat = {
        playerId: hotSeatPlayerId,
        revealIndex: 0,
        revealedPositions: [],
        roundScores: {},
        readyPlayers: [],
        perfectGuessers: [],
        shuffledCards: shuffle(hotSeatPlayer.cards), // store shuffled order for guessers
    };

    // Initialize round scores to 0 for all connected players
    for (const [id, player] of Object.entries(room.players)) {
        if (player.connected) {
            room.hotSeat.roundScores[id] = 0;
        }
    }

    // Reset guesses for all players
    for (const player of Object.values(room.players)) {
        player.currentGuess = null;
        player.hasGuessed = false;
    }
    // Hot seat player doesn't guess
    hotSeatPlayer.hasGuessed = true;

    setRoomTimer(room, room.settings.guessingTimerSeconds, () => {
        handleGuessingTimeout(room, io, emitRoomUpdate);
    });

    emitRoomUpdate(io, room);
}

export function submitGuess(room, socketId, guess) {
    if (room.phase !== 'guessing') return { error: 'Not in guessing phase' };
    if (!Array.isArray(guess)) return { error: 'Invalid guess format' };

    if (room.hotSeat && room.hotSeat.playerId === socketId) {
        return { error: 'Hot seat player cannot guess' };
    }

    const player = room.players[socketId];
    if (!player) return { error: 'Player not found' };
    if (player.hasGuessed) return { error: 'Already submitted guess' };

    // Validate guess contains exactly the hot seat player's card IDs
    const hotSeatPlayer = room.players[room.hotSeat.playerId];
    const hotSeatCardIds = hotSeatPlayer.cards.map((c) => c.id).sort();
    const guessIds = [...guess].sort();
    if (
        guess.length !== hotSeatCardIds.length ||
        !guessIds.every((id, i) => id === hotSeatCardIds[i])
    ) {
        return { error: 'Invalid guess: must contain exactly the hot seat cards' };
    }

    player.currentGuess = guess;
    player.hasGuessed = true;

    return {};
}

export function checkAllGuessed(room, io, emitRoomUpdate) {
    const allGuessed = Object.values(room.players)
        .filter((p) => p.connected)
        .every((p) => p.hasGuessed);

    if (allGuessed) {
        clearRoomTimer(room.code);
        room.timerEndAt = null;
        room.phase = 'reveal';

        // If hot seat disconnected during guessing, auto-reveal after 10s
        const hotSeatPlayer = room.players[room.hotSeat.playerId];
        if (hotSeatPlayer && !hotSeatPlayer.connected) {
            scheduleAutoReveal(room, io, emitRoomUpdate);
        }

        emitRoomUpdate(io, room);
        return true;
    }
    return false;
}

function handleGuessingTimeout(room, io, emitRoomUpdate) {
    // Auto-submit for players who haven't guessed
    const hotSeatPlayer = room.players[room.hotSeat.playerId];
    for (const player of Object.values(room.players)) {
        if (!player.hasGuessed && player.connected && player.id !== room.hotSeat.playerId) {
            // Default guess: shuffled card order
            player.currentGuess = hotSeatPlayer.cards.map((c) => c.id);
            player.hasGuessed = true;
        }
    }
    room.timerEndAt = null;
    room.phase = 'reveal';

    // If hot seat disconnected during guessing, auto-reveal after 10s
    if (hotSeatPlayer && !hotSeatPlayer.connected) {
        scheduleAutoReveal(room, io, emitRoomUpdate);
    }

    emitRoomUpdate(io, room);
}

export function scoreGuesserPosition(actualRanking, guesserGuess, positionIndex) {
    const actualCardId = actualRanking[positionIndex];
    const guessedIndex = guesserGuess.indexOf(actualCardId);
    const diff = Math.abs(positionIndex - guessedIndex);
    if (diff === 0) return 2;
    if (diff === 1) return 1;
    return 0;
}

export function scoreHotSeatPosition(actualRanking, allGuesses, positionIndex) {
    const actualCardId = actualRanking[positionIndex];
    let count = 0;
    for (const guess of Object.values(allGuesses)) {
        if (guess.indexOf(actualCardId) === positionIndex) count++;
    }
    return count;
}

function revealPosition(room, positionIndex) {
    const hotSeatPlayer = room.players[room.hotSeat.playerId];
    const actualRanking = hotSeatPlayer.ranking;

    // Collect all guesses (non-hot-seat players with guesses)
    const allGuesses = {};
    for (const [id, player] of Object.entries(room.players)) {
        if (id !== room.hotSeat.playerId && player.currentGuess) {
            allGuesses[id] = player.currentGuess;
        }
    }

    // Score guessers for this position
    for (const [id, guess] of Object.entries(allGuesses)) {
        const points = scoreGuesserPosition(actualRanking, guess, positionIndex);
        if (points > 0) {
            room.players[id].score += points;
            room.hotSeat.roundScores[id] = (room.hotSeat.roundScores[id] || 0) + points;
        }
    }

    // Score hot seat player for this position
    const hotSeatPoints = scoreHotSeatPosition(actualRanking, allGuesses, positionIndex);
    if (hotSeatPoints > 0) {
        hotSeatPlayer.score += hotSeatPoints;
        room.hotSeat.roundScores[room.hotSeat.playerId] =
            (room.hotSeat.roundScores[room.hotSeat.playerId] || 0) + hotSeatPoints;
    }

    room.hotSeat.revealedPositions.push(positionIndex);
    room.hotSeat.revealIndex = room.hotSeat.revealedPositions.length;

    // After all 5 revealed, track perfect guessers for display (no bonus)
    if (room.hotSeat.revealIndex >= 5) {
        const perfectIds = [];
        for (const [id, guess] of Object.entries(allGuesses)) {
            let total = 0;
            for (let i = 0; i < actualRanking.length; i++) {
                total += scoreGuesserPosition(actualRanking, guess, i);
            }
            if (total === 10) perfectIds.push(id);
        }
        room.hotSeat.perfectGuessers = perfectIds;
    }
}

export function revealNext(room, socketId, io, emitRoomUpdate, positionIndex) {
    if (room.phase !== 'reveal') return { error: 'Not in reveal phase' };
    if (!room.hotSeat || room.hotSeat.playerId !== socketId) {
        return { error: 'Only the hot seat player can reveal' };
    }
    if (room.hotSeat.revealIndex >= 5) return { error: 'All cards already revealed' };

    // Validate positionIndex — fall back to next unrevealed position in order
    let pos;
    if (typeof positionIndex === 'number') {
        pos = positionIndex;
    } else {
        pos = [0, 1, 2, 3, 4].find(i => !room.hotSeat.revealedPositions.includes(i));
        if (pos === undefined) return { error: 'All cards already revealed' };
    }
    if (pos < 0 || pos > 4) return { error: 'Invalid position' };
    if (room.hotSeat.revealedPositions.includes(pos)) return { error: 'Position already revealed' };

    revealPosition(room, pos);

    // All revealed → stay in reveal, wait for players to click proceed
    if (room.hotSeat.revealIndex >= 5) {
        room.hotSeat.readyPlayers = [];
    }

    emitRoomUpdate(io, room);
    return {};
}

export function autoRevealRemaining(room, io, emitRoomUpdate) {
    if (room.phase !== 'reveal') return;
    if (!room.hotSeat) return;

    // Reveal all remaining positions
    while (room.hotSeat.revealIndex < 5) {
        const nextPos = [0, 1, 2, 3, 4].find(i => !room.hotSeat.revealedPositions.includes(i));
        if (nextPos === undefined) break;
        revealPosition(room, nextPos);
    }

    // Stay in reveal phase — players click proceed
    room.hotSeat.readyPlayers = [];

    emitRoomUpdate(io, room);
}

export function scheduleAutoReveal(room, io, emitRoomUpdate) {
    setRoomTimer(room, 10, () => {
        autoRevealRemaining(room, io, emitRoomUpdate);
    });
}

export function playerReady(room, socketId, io, emitRoomUpdate) {
    if (room.phase !== 'reveal' || !room.hotSeat || room.hotSeat.revealIndex < 5) {
        return { error: 'Cannot proceed yet' };
    }
    if (!room.hotSeat.readyPlayers.includes(socketId)) {
        room.hotSeat.readyPlayers.push(socketId);
    }

    // Check if all connected players are ready
    const connectedIds = Object.entries(room.players)
        .filter(([, p]) => p.connected)
        .map(([id]) => id);
    const allReady = connectedIds.every(id => room.hotSeat.readyPlayers.includes(id));

    if (allReady) {
        return advanceFromScores(room, io, emitRoomUpdate);
    }

    emitRoomUpdate(io, room);
    return {};
}

export function cancelAutoReveal(room) {
    if (room.phase === 'reveal') {
        clearRoomTimer(room.code);
        room.timerEndAt = null;
    }
}

export function advanceFromScores(room, io, emitRoomUpdate) {
    if (room.phase !== 'scores' && room.phase !== 'reveal') return { error: 'Not in scores/reveal phase' };
    clearRoomTimer(room.code);
    room.timerEndAt = null;

    // Try next hot seat player
    if (!advanceHotSeat(room, io, emitRoomUpdate)) {
        emitRoomUpdate(io, room);
    }
}

// Returns true if it handled the transition (emitted update), false otherwise
function advanceHotSeat(room, io, emitRoomUpdate) {
    room.hotSeatIndex++;

    // Skip disconnected/removed players
    while (
        room.hotSeatIndex < room.playerOrder.length &&
        (!room.players[room.playerOrder[room.hotSeatIndex]] ||
            !room.players[room.playerOrder[room.hotSeatIndex]].connected)
    ) {
        room.hotSeatIndex++;
    }

    if (room.hotSeatIndex < room.playerOrder.length) {
        // More hot seat players in this round
        startGuessingPhase(room, io, emitRoomUpdate);
        return true;
    }

    // All hot seats done for this round
    if (room.currentRoundNumber < room.totalRounds) {
        // Start next round
        room.currentRoundNumber++;
        room.hotSeatIndex = 0;
        dealRound(room);
        room.phase = 'ranking';

        setRoomTimer(room, room.settings.rankingTimerSeconds, () => {
            handleRankingTimeout(room, io, emitRoomUpdate);
        });

        emitRoomUpdate(io, room);
        return true;
    }

    // All rounds done
    room.phase = 'game_end';
    room.hotSeat = null;
    emitRoomUpdate(io, room);
    return true;
}

export function playAgain(room, io, emitRoomUpdate) {
    if (room.phase !== 'game_end') return { error: 'Game not ended' };

    clearRoomTimer(room.code);

    // Reset game state, keep players
    room.phase = 'lobby';
    room.mode = null;
    room.currentRoundNumber = 0;
    room.hotSeatIndex = 0;
    room.roundType = null;
    room.usedCategoryIds = [];
    room.usedSituationIds = [];
    room.hotSeat = null;
    room.timerEndAt = null;

    for (const player of Object.values(room.players)) {
        player.score = 0;
        player.assignment = null;
        player.cards = [];
        player.ranking = null;
        player.hasRanked = false;
        player.currentGuess = null;
        player.hasGuessed = false;
    }

    // Remove disconnected players
    for (const [id, player] of Object.entries(room.players)) {
        if (!player.connected) {
            delete room.players[id];
            room.playerOrder = room.playerOrder.filter((pid) => pid !== id);
        }
    }

    // Reassign host if needed
    if (!room.players[room.hostId] && room.playerOrder.length > 0) {
        room.hostId = room.playerOrder[0];
    }

    return {};
}
