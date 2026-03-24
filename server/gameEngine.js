import { dealRound, shuffle } from './deckManager.js';

const timers = new Map(); // roomCode -> timeoutId

export function clearRoomTimer(roomCode) {
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
    if (totalRounds < 1 || totalRounds > 10) {
        return { error: 'Rounds must be between 1 and 10' };
    }

    room.mode = connectedPlayers.length === 2 ? 'coop' : 'competitive';
    room.totalRounds = totalRounds;
    room.currentRoundNumber = 1;
    room.hotSeatIndex = 0;
    room.usedCategoryIds = [];
    room.usedSituationIds = [];
    room.coopStats = { exact: 0, offByOne: 0, missed: 0 };
    room.gameHistory = [];

    // Shuffle spotlight order
    room.playerOrder = shuffle([...room.playerOrder]);

    // Reset all scores
    for (const player of Object.values(room.players)) {
        player.score = 0;
    }

    dealRound(room);
    room.phase = 'ranking';

    if (room.settings.rankingTimerSeconds > 0) {
        setRoomTimer(room, room.settings.rankingTimerSeconds, () => {
            handleRankingTimeout(room, io, emitRoomUpdate);
        });
    }

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
    player._rankedAt = Date.now();

    return {};
}

export function checkAllRanked(room, io, emitRoomUpdate) {
    const allRanked = Object.values(room.players)
        .filter((p) => p.connected && !p.pendingMidGameChoice)
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
    // Coop 2-player: both guess each other simultaneously
    if (room.mode === 'coop') {
        startCoopGuessingPhase(room, io, emitRoomUpdate);
        return;
    }

    const hotSeatPlayerId = room.playerOrder[room.hotSeatIndex];
    const hotSeatPlayer = room.players[hotSeatPlayerId];

    if (!hotSeatPlayer || !hotSeatPlayer.connected || hotSeatPlayer.guesserOnly) {
        // Skip disconnected or guesser-only hot seat players
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
        if (player.connected && !player.pendingMidGameChoice) {
            room.hotSeat.roundScores[id] = 0;
        }
    }

    // Reset guesses for all players
    for (const player of Object.values(room.players)) {
        if (player.pendingMidGameChoice) continue; // pending players stay blocked
        player.currentGuess = null;
        player.hasGuessed = false;
    }
    // Hot seat player doesn't guess
    hotSeatPlayer.hasGuessed = true;

    if (room.settings.guessingTimerSeconds > 0) {
        setRoomTimer(room, room.settings.guessingTimerSeconds, () => {
            handleGuessingTimeout(room, io, emitRoomUpdate);
        });
    }

    emitRoomUpdate(io, room);
}

function startCoopGuessingPhase(room, io, emitRoomUpdate) {
    const [idA, idB] = room.playerOrder.filter(id => room.players[id]?.connected);
    const playerA = room.players[idA];
    const playerB = room.players[idB];

    if (!playerA || !playerB) return;

    room.phase = 'guessing';

    // Track ranking submission order for reveal ordering
    const aRankedFirst = playerA._rankedAt <= playerB._rankedAt;
    const firstId = aRankedFirst ? idA : idB;
    const secondId = aRankedFirst ? idB : idA;

    room.hotSeat = {
        playerId: firstId, // Who reveals first
        coopSecondId: secondId,
        coopPhase: 'guessing', // guessing → reveal_first → reveal_second
        revealIndex: 0,
        revealedPositions: [],
        roundScores: {},
        readyPlayers: [],
        perfectGuessers: [],
        shuffledCards: shuffle(room.players[firstId].cards),
        coopSecondShuffledCards: shuffle(room.players[secondId].cards),
    };

    // Initialize round scores
    room.hotSeat.roundScores[idA] = 0;
    room.hotSeat.roundScores[idB] = 0;

    // Both players guess — neither is pre-marked
    for (const player of Object.values(room.players)) {
        player.currentGuess = null;
        player.hasGuessed = false;
    }

    if (room.settings.guessingTimerSeconds > 0) {
        setRoomTimer(room, room.settings.guessingTimerSeconds, () => {
            handleGuessingTimeout(room, io, emitRoomUpdate);
        });
    }

    emitRoomUpdate(io, room);
}

export function submitGuess(room, socketId, guess) {
    if (room.phase !== 'guessing') return { error: 'Not in guessing phase' };
    if (!Array.isArray(guess)) return { error: 'Invalid guess format' };

    const player = room.players[socketId];
    if (!player) return { error: 'Player not found' };
    if (player.hasGuessed) return { error: 'Already submitted guess' };

    if (room.mode === 'coop') {
        // In coop, each player guesses the OTHER player's cards
        const otherId = socketId === room.hotSeat.playerId
            ? room.hotSeat.coopSecondId
            : room.hotSeat.playerId;
        const otherPlayer = room.players[otherId];
        const otherCardIds = otherPlayer.cards.map((c) => c.id).sort();
        const guessIds = [...guess].sort();
        if (
            guess.length !== otherCardIds.length ||
            !guessIds.every((id, i) => id === otherCardIds[i])
        ) {
            return { error: 'Invalid guess: must contain exactly the other player\'s cards' };
        }
    } else {
        if (room.hotSeat && room.hotSeat.playerId === socketId) {
            return { error: 'Hot seat player cannot guess' };
        }

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
    }

    player.currentGuess = guess;
    player.hasGuessed = true;

    return {};
}

export function checkAllGuessed(room, io, emitRoomUpdate) {
    const allGuessed = Object.values(room.players)
        .filter((p) => p.connected && !p.pendingMidGameChoice)
        .every((p) => p.hasGuessed);

    if (allGuessed) {
        clearRoomTimer(room.code);
        room.timerEndAt = null;
        room.phase = 'reveal';

        if (room.mode === 'coop') {
            // Start revealing the first player's ranking
            room.hotSeat.coopPhase = 'reveal_first';
            room.hotSeat.revealIndex = 0;
            room.hotSeat.revealedPositions = [];
            room.hotSeat.readyPlayers = [];
        } else {
            // If hot seat disconnected during guessing, auto-reveal after 10s
            const hotSeatPlayer = room.players[room.hotSeat.playerId];
            if (hotSeatPlayer && !hotSeatPlayer.connected) {
                scheduleAutoReveal(room, io, emitRoomUpdate);
            }
        }

        emitRoomUpdate(io, room);
        return true;
    }
    return false;
}

function handleGuessingTimeout(room, io, emitRoomUpdate) {
    if (room.mode === 'coop') {
        // Auto-submit for both players who haven't guessed
        const firstId = room.hotSeat.playerId;
        const secondId = room.hotSeat.coopSecondId;
        for (const player of Object.values(room.players)) {
            if (!player.hasGuessed && player.connected) {
                // Default guess: the other player's cards in dealt order
                const otherId = player.id === firstId ? secondId : firstId;
                const otherPlayer = room.players[otherId];
                player.currentGuess = otherPlayer.cards.map((c) => c.id);
                player.hasGuessed = true;
            }
        }
        room.timerEndAt = null;
        room.phase = 'reveal';
        room.hotSeat.coopPhase = 'reveal_first';
        room.hotSeat.revealIndex = 0;
        room.hotSeat.revealedPositions = [];
        room.hotSeat.readyPlayers = [];
        emitRoomUpdate(io, room);
        return;
    }

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
    const isCoop = room.mode === 'coop';
    const isSecondReveal = isCoop && room.hotSeat.coopPhase === 'reveal_second';

    // In coop second reveal, we're revealing the second player's ranking
    const revealPlayerId = isSecondReveal ? room.hotSeat.coopSecondId : room.hotSeat.playerId;
    const revealPlayer = room.players[revealPlayerId];
    const actualRanking = revealPlayer.ranking;

    if (isCoop) {
        // In coop, the guesser is the OTHER player
        const guesserId = isSecondReveal ? room.hotSeat.playerId : room.hotSeat.coopSecondId;
        const guesser = room.players[guesserId];
        if (guesser && guesser.currentGuess) {
            const points = scoreGuesserPosition(actualRanking, guesser.currentGuess, positionIndex);
            // Track cumulative coop stats
            if (points === 2) room.coopStats.exact++;
            else if (points === 1) room.coopStats.offByOne++;
            else room.coopStats.missed++;
            if (points > 0) {
                guesser.score += points;
                room.hotSeat.roundScores[guesserId] = (room.hotSeat.roundScores[guesserId] || 0) + points;
            }
        }
    } else {
        // Competitive mode
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
            revealPlayer.score += hotSeatPoints;
            room.hotSeat.roundScores[room.hotSeat.playerId] =
                (room.hotSeat.roundScores[room.hotSeat.playerId] || 0) + hotSeatPoints;
        }
    }

    room.hotSeat.revealedPositions.push(positionIndex);
    room.hotSeat.revealIndex = room.hotSeat.revealedPositions.length;

    // After all 5 revealed, track perfect guessers for display (no bonus)
    if (room.hotSeat.revealIndex >= 5) {
        if (isCoop) {
            const guesserId = isSecondReveal ? room.hotSeat.playerId : room.hotSeat.coopSecondId;
            const guesser = room.players[guesserId];
            if (guesser && guesser.currentGuess) {
                let total = 0;
                for (let i = 0; i < actualRanking.length; i++) {
                    total += scoreGuesserPosition(actualRanking, guesser.currentGuess, i);
                }
                if (total === 10) room.hotSeat.perfectGuessers.push(guesserId);
            }
        } else {
            const allGuesses = {};
            for (const [id, player] of Object.entries(room.players)) {
                if (id !== room.hotSeat.playerId && player.currentGuess) {
                    allGuesses[id] = player.currentGuess;
                }
            }
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

        // Record spotlight summary for end-game insights
        if (!room.gameHistory) room.gameHistory = [];
        const historyGuessScores = {};
        const historyGuesses = {};
        if (isCoop) {
            const gId = isSecondReveal ? room.hotSeat.playerId : room.hotSeat.coopSecondId;
            const g = room.players[gId];
            if (g && g.currentGuess) {
                let ex = 0, ob = 0, mi = 0;
                for (let i = 0; i < actualRanking.length; i++) {
                    const pts = scoreGuesserPosition(actualRanking, g.currentGuess, i);
                    if (pts === 2) ex++; else if (pts === 1) ob++; else mi++;
                }
                historyGuessScores[gId] = { points: ex * 2 + ob, exact: ex, offByOne: ob, missed: mi };
                historyGuesses[gId] = [...g.currentGuess];
            }
        } else {
            for (const [id, player] of Object.entries(room.players)) {
                if (id !== room.hotSeat.playerId && player.currentGuess) {
                    let ex = 0, ob = 0, mi = 0;
                    for (let i = 0; i < actualRanking.length; i++) {
                        const pts = scoreGuesserPosition(actualRanking, player.currentGuess, i);
                        if (pts === 2) ex++; else if (pts === 1) ob++; else mi++;
                    }
                    historyGuessScores[id] = { points: ex * 2 + ob, exact: ex, offByOne: ob, missed: mi };
                    historyGuesses[id] = [...player.currentGuess];
                }
            }
        }
        const spotlightPlayer = room.players[revealPlayerId];
        room.gameHistory.push({
            spotlightId: revealPlayerId,
            assignmentName: spotlightPlayer?.assignment?.name || '',
            guessScores: historyGuessScores,
            guesses: historyGuesses,
        });
    }
}

export function revealNext(room, socketId, io, emitRoomUpdate, positionIndex) {
    if (room.phase !== 'reveal') return { error: 'Not in reveal phase' };

    if (room.mode === 'coop') {
        // In coop, the person being revealed (spotlight) controls the reveal
        const isSecondReveal = room.hotSeat.coopPhase === 'reveal_second';
        const revealerId = isSecondReveal ? room.hotSeat.coopSecondId : room.hotSeat.playerId;
        if (socketId !== revealerId) {
            return { error: 'Only the spotlight player can reveal' };
        }
    } else {
        if (!room.hotSeat || room.hotSeat.playerId !== socketId) {
            return { error: 'Only the hot seat player can reveal' };
        }
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

    // Check if all connected players are ready (exclude pending mid-game joiners)
    const connectedIds = Object.entries(room.players)
        .filter(([, p]) => p.connected && !p.pendingMidGameChoice)
        .map(([id]) => id);
    const allReady = connectedIds.every(id => room.hotSeat.readyPlayers.includes(id));

    if (allReady) {
        // Coop: transition from reveal_first → reveal_second
        if (room.mode === 'coop' && room.hotSeat.coopPhase === 'reveal_first') {
            room.hotSeat.coopPhase = 'reveal_second';
            room.hotSeat.revealIndex = 0;
            room.hotSeat.revealedPositions = [];
            room.hotSeat.readyPlayers = [];
            room.hotSeat.perfectGuessers = [];

            // Swap guesses: now the second player's ranking is revealed,
            // and the first player is the guesser
            emitRoomUpdate(io, room);
            return {};
        }

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
    // In coop mode, both players already guessed each other — skip hot seat rotation
    if (room.mode === 'coop') {
        if (room.currentRoundNumber < room.totalRounds) {
            room.currentRoundNumber++;
            room.hotSeatIndex = 0;
            dealRound(room);
            room.phase = 'ranking';

            if (room.settings.rankingTimerSeconds > 0) {
                setRoomTimer(room, room.settings.rankingTimerSeconds, () => {
                    handleRankingTimeout(room, io, emitRoomUpdate);
                });
            }

            emitRoomUpdate(io, room);
            return true;
        }

        // All rounds done
        room.phase = 'game_end';
        room.hotSeat = null;
        emitRoomUpdate(io, room);
        return true;
    }

    room.hotSeatIndex++;

    // Skip disconnected/removed/guesser-only players
    while (
        room.hotSeatIndex < room.playerOrder.length &&
        (!room.players[room.playerOrder[room.hotSeatIndex]] ||
            !room.players[room.playerOrder[room.hotSeatIndex]].connected ||
            room.players[room.playerOrder[room.hotSeatIndex]].guesserOnly)
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

        if (room.settings.rankingTimerSeconds > 0) {
            setRoomTimer(room, room.settings.rankingTimerSeconds, () => {
                handleRankingTimeout(room, io, emitRoomUpdate);
            });
        }

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
    room.coopStats = { exact: 0, offByOne: 0, missed: 0 };
    room.gameHistory = [];

    for (const player of Object.values(room.players)) {
        player.score = 0;
        player.assignment = null;
        player.cards = [];
        player.ranking = null;
        player.hasRanked = false;
        player.currentGuess = null;
        player.hasGuessed = false;
        player.guesserOnly = false;
        player.pendingMidGameChoice = false;
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
