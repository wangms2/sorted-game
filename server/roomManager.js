import { v4 as uuidv4 } from 'uuid';
import { shuffle } from './deckManager.js';

const rooms = new Map();
const socketToRoom = new Map();
const disconnectTimers = new Map();

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (avoidable confusion)

function generateRoomCode() {
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
        }
    } while (rooms.has(code));
    return code;
}

function createPlayer(name, socketId) {
    return {
        id: socketId,
        name,
        sessionToken: uuidv4(),
        score: 0,
        assignment: null,
        cards: [],
        ranking: null,
        hasRanked: false,
        currentGuess: null,
        hasGuessed: false,
        connected: true,
    };
}

export function createRoom(playerName, socketId) {
    const code = generateRoomCode();
    const player = createPlayer(playerName, socketId);
    const room = {
        code,
        hostId: socketId,
        phase: 'lobby',
        players: { [socketId]: player },
        playerOrder: [socketId],
        hotSeatIndex: 0,
        currentRoundNumber: 0,
        totalRounds: 1,
        roundType: null,
        usedCategoryIds: [],
        usedSituationIds: [],
        hotSeat: null,
        settings: {
            rankingTimerSeconds: 60,
            guessingTimerSeconds: 90,
        },
        pendingSettings: {
            totalRounds: 1,
            timerSeconds: 60,
        },
        timerEndAt: null,
    };
    rooms.set(code, room);
    socketToRoom.set(socketId, code);
    return room;
}

export function joinRoom(code, playerName, socketId) {
    const upperCode = code.toUpperCase();
    const room = rooms.get(upperCode);
    if (!room) return { error: 'Room not found' };
    if (Object.keys(room.players).length >= 15) return { error: 'Room is full' };

    const player = createPlayer(playerName, socketId);

    // Mid-game join: mark as pending choice so they don't block current phase
    if (room.phase !== 'lobby') {
        player.hasRanked = true;
        player.hasGuessed = true;
        player.pendingMidGameChoice = true;
    }

    room.players[socketId] = player;
    room.playerOrder.push(socketId);
    socketToRoom.set(socketId, upperCode);
    return { room };
}

export function rejoinAsPlayer(room, socketId, targetPlayerId) {
    const joiner = room.players[socketId];
    if (!joiner || !joiner.pendingMidGameChoice) return { error: 'Not pending choice' };

    const target = room.players[targetPlayerId];
    if (!target || target.connected) return { error: 'Player not available to take over' };

    // Clear disconnect timer for the target
    const timerId = disconnectTimers.get(targetPlayerId);
    if (timerId) {
        clearTimeout(timerId);
        disconnectTimers.delete(targetPlayerId);
    }

    // Transfer target's game state to joiner's socket
    const joinerName = joiner.name;
    delete room.players[socketId];
    delete room.players[targetPlayerId];

    target.id = socketId;
    target.name = joinerName;
    target.sessionToken = joiner.sessionToken;
    target.connected = true;
    room.players[socketId] = target;

    // Update playerOrder: replace target with new socketId, remove joiner's original entry
    const targetIdx = room.playerOrder.indexOf(targetPlayerId);
    if (targetIdx !== -1) room.playerOrder[targetIdx] = socketId;
    // Remove the joiner's original entry (added at end by joinRoom)
    const joinerOrigIdx = room.playerOrder.lastIndexOf(socketId);
    if (joinerOrigIdx !== -1 && joinerOrigIdx !== targetIdx) {
        room.playerOrder.splice(joinerOrigIdx, 1);
    }

    // Update hostId if needed
    if (room.hostId === targetPlayerId) room.hostId = socketId;

    // Update hotSeat references
    if (room.hotSeat) {
        if (room.hotSeat.playerId === targetPlayerId) room.hotSeat.playerId = socketId;
        if (room.hotSeat.coopSecondId === targetPlayerId) room.hotSeat.coopSecondId = socketId;
        if (room.hotSeat.roundScores[targetPlayerId] !== undefined) {
            room.hotSeat.roundScores[socketId] = room.hotSeat.roundScores[targetPlayerId];
            delete room.hotSeat.roundScores[targetPlayerId];
        }
    }

    // Remap socketToRoom
    socketToRoom.delete(targetPlayerId);
    socketToRoom.set(socketId, room.code);

    return { room };
}

export function joinAsGuesser(room, socketId) {
    const player = room.players[socketId];
    if (!player || !player.pendingMidGameChoice) return { error: 'Not pending choice' };

    player.guesserOnly = true;
    player.pendingMidGameChoice = false;
    player.hasRanked = true; // never ranks

    // If joining during guessing phase, allow them to guess this turn
    if (room.phase === 'guessing' && room.hotSeat) {
        player.hasGuessed = false;
        player.currentGuess = null;
        room.hotSeat.roundScores[socketId] = 0;
    }

    return { room };
}

export function getRoom(code) {
    return rooms.get(code) || null;
}

export function getRoomBySocketId(socketId) {
    const code = socketToRoom.get(socketId);
    return code ? rooms.get(code) || null : null;
}

export function reconnectPlayer(sessionToken, roomCode, newSocketId) {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) return { error: 'Room not found' };

    const oldSocketId = Object.keys(room.players).find(
        (id) => room.players[id].sessionToken === sessionToken
    );
    if (!oldSocketId) return { error: 'Session not found' };

    const player = room.players[oldSocketId];

    // Clear any pending disconnect timer
    const timerId = disconnectTimers.get(oldSocketId);
    if (timerId) {
        clearTimeout(timerId);
        disconnectTimers.delete(oldSocketId);
    }

    // Remap socket ID
    delete room.players[oldSocketId];
    player.id = newSocketId;
    player.connected = true;
    room.players[newSocketId] = player;

    // Update playerOrder
    const orderIdx = room.playerOrder.indexOf(oldSocketId);
    if (orderIdx !== -1) room.playerOrder[orderIdx] = newSocketId;

    // Update hostId if needed
    if (room.hostId === oldSocketId) room.hostId = newSocketId;

    // Update hotSeat playerId if needed
    if (room.hotSeat && room.hotSeat.playerId === oldSocketId) {
        room.hotSeat.playerId = newSocketId;
    }
    if (room.hotSeat && room.hotSeat.coopSecondId === oldSocketId) {
        room.hotSeat.coopSecondId = newSocketId;
    }

    // Update roundScores keys
    if (room.hotSeat && room.hotSeat.roundScores[oldSocketId] !== undefined) {
        room.hotSeat.roundScores[newSocketId] = room.hotSeat.roundScores[oldSocketId];
        delete room.hotSeat.roundScores[oldSocketId];
    }

    // Remap socketToRoom
    socketToRoom.delete(oldSocketId);
    socketToRoom.set(newSocketId, roomCode.toUpperCase());

    return { room };
}

export function removePlayer(socketId, io) {
    const room = getRoomBySocketId(socketId);
    if (!room) {
        socketToRoom.delete(socketId);
        return null;
    }

    delete room.players[socketId];
    room.playerOrder = room.playerOrder.filter((id) => id !== socketId);
    socketToRoom.delete(socketId);

    // If room is now empty, delete it
    if (room.playerOrder.length === 0) {
        rooms.delete(room.code);
        return null;
    }

    // If host left, reassign
    if (room.hostId === socketId) {
        room.hostId = room.playerOrder[0];
    }

    return room;
}

export function handleDisconnect(socketId, io, emitRoomUpdate) {
    const room = getRoomBySocketId(socketId);
    if (!room) {
        socketToRoom.delete(socketId);
        return;
    }

    const player = room.players[socketId];
    if (!player) return;

    // In lobby, remove immediately
    if (room.phase === 'lobby') {
        const updatedRoom = removePlayer(socketId, io);
        if (updatedRoom) emitRoomUpdate(io, updatedRoom);
        return;
    }

    // Mid-game: mark disconnected, start 60s timer
    player.connected = false;

    // Immediately transfer host if the host disconnected
    if (room.hostId === socketId) {
        const nextHost = room.playerOrder.find(
            (id) => id !== socketId && room.players[id]?.connected
        );
        if (nextHost) room.hostId = nextHost;
    }

    emitRoomUpdate(io, room);

    const timerId = setTimeout(() => {
        disconnectTimers.delete(socketId);
        const updatedRoom = removePlayer(socketId, io);
        if (!updatedRoom) return;

        // If fewer than 2 connected players remain, end game
        const connectedCount = Object.values(updatedRoom.players).filter(
            (p) => p.connected
        ).length;
        if (connectedCount < 2) {
            updatedRoom.phase = 'game_end';
        }

        emitRoomUpdate(io, updatedRoom);
    }, 120000);

    disconnectTimers.set(socketId, timerId);
}

export function filterRoomForPlayer(room, socketId) {
    const filtered = {
        code: room.code,
        hostId: room.hostId,
        phase: room.phase,
        mode: room.mode || null,
        coopStats: room.coopStats || null,
        playerOrder: room.playerOrder,
        hotSeatIndex: room.hotSeatIndex,
        currentRoundNumber: room.currentRoundNumber,
        totalRounds: room.totalRounds,
        roundType: room.roundType,
        settings: room.settings,
        pendingSettings: room.pendingSettings || null,
        timerEndAt: room.timerEndAt,
        gameHistory: room.gameHistory || [],
        hotSeat: null,
        players: {},
    };

    // Filter players: strip sensitive data from other players
    for (const [id, player] of Object.entries(room.players)) {
        if (id === socketId) {
            // Current player sees their own full data (minus sessionToken in nested, include at top)
            filtered.players[id] = {
                id: player.id,
                name: player.name,
                score: player.score,
                assignment: player.assignment,
                cards: player.cards,
                ranking: player.ranking,
                hasRanked: player.hasRanked,
                currentGuess: player.currentGuess,
                hasGuessed: player.hasGuessed,
                connected: player.connected,
                sessionToken: player.sessionToken,
                guesserOnly: player.guesserOnly || false,
                pendingMidGameChoice: player.pendingMidGameChoice || false,
            };

            // If pending mid-game choice, include joinOptions
            if (player.pendingMidGameChoice) {
                const disconnectedPlayers = Object.values(room.players)
                    .filter((p) => !p.connected && !p.pendingMidGameChoice)
                    .map((p) => ({ id: p.id, name: p.name }));
                filtered.players[id].joinOptions = {
                    disconnectedPlayers,
                    canJoinAsGuesser: room.mode !== 'coop',
                };
            }
        } else {
            // Other players: strip ranking, guess, assignment details, cards, sessionToken
            filtered.players[id] = {
                id: player.id,
                name: player.name,
                score: player.score,
                hasRanked: player.hasRanked,
                hasGuessed: player.hasGuessed,
                connected: player.connected,
                guesserOnly: player.guesserOnly || false,
            };
        }
    }

    // During guessing/reveal/scores: include hot seat info
    if (room.hotSeat && (room.phase === 'guessing' || room.phase === 'reveal' || room.phase === 'scores')) {
        const isCoop = room.mode === 'coop';
        const hotSeatPlayer = room.players[room.hotSeat.playerId];

        if (isCoop) {
            const isSecondReveal = room.hotSeat.coopPhase === 'reveal_second';
            // During guessing: each player guesses the OTHER player's ranking
            // During reveal: show whose ranking is being revealed
            const revealPlayerId = isSecondReveal ? room.hotSeat.coopSecondId : room.hotSeat.playerId;
            const revealPlayer = room.players[revealPlayerId];
            const guesserId = isSecondReveal ? room.hotSeat.playerId : room.hotSeat.coopSecondId;

            if (room.phase === 'guessing') {
                // Each player sees the OTHER player's cards (shuffled) and assignment
                const otherId = socketId === room.hotSeat.playerId
                    ? room.hotSeat.coopSecondId
                    : room.hotSeat.playerId;
                const otherPlayer = room.players[otherId];
                // Use the pre-shuffled cards for this player's target
                const otherShuffledCards = otherId === room.hotSeat.playerId
                    ? room.hotSeat.shuffledCards
                    : room.hotSeat.coopSecondShuffledCards;

                filtered.hotSeat = {
                    playerId: room.hotSeat.playerId,
                    coopSecondId: room.hotSeat.coopSecondId,
                    coopPhase: room.hotSeat.coopPhase,
                    revealIndex: room.hotSeat.revealIndex,
                    revealedPositions: [],
                    roundScores: room.hotSeat.roundScores,
                    perfectGuessers: [],
                    readyPlayers: room.hotSeat.readyPlayers || [],
                    // Show the OTHER player's assignment and cards for guessing
                    assignment: otherPlayer.assignment,
                    cards: shuffle([...otherShuffledCards]),
                    targetPlayerId: otherId,
                };
            } else {
                // reveal or scores phase
                filtered.hotSeat = {
                    playerId: room.hotSeat.playerId,
                    coopSecondId: room.hotSeat.coopSecondId,
                    coopPhase: room.hotSeat.coopPhase,
                    revealIndex: room.hotSeat.revealIndex,
                    revealedPositions: room.hotSeat.revealedPositions || [],
                    roundScores: room.hotSeat.roundScores,
                    perfectGuessers: room.hotSeat.perfectGuessers || [],
                    readyPlayers: room.hotSeat.readyPlayers || [],
                    assignment: revealPlayer.assignment,
                    cards: revealPlayerId === room.hotSeat.playerId
                        ? room.hotSeat.shuffledCards
                        : room.hotSeat.coopSecondShuffledCards,
                    targetPlayerId: revealPlayerId,
                };

                // Include revealed ranking
                const fullRanking = revealPlayer.ranking || [];
                const positions = room.hotSeat.revealedPositions || [];
                const revealed = {};
                for (const pos of positions) {
                    revealed[pos] = fullRanking[pos];
                }
                filtered.hotSeat.revealedRanking = revealed;

                // Include the guesser's guess
                const guesserPlayer = room.players[guesserId];
                if (guesserPlayer && guesserPlayer.currentGuess) {
                    filtered.hotSeat.myGuess = guesserPlayer.currentGuess;
                    filtered.hotSeat.guesserId = guesserId;
                }
            }
        } else if (hotSeatPlayer) {
            const baseCards = room.hotSeat.shuffledCards || hotSeatPlayer.cards;
            // Each guesser gets a unique shuffle; non-guessing phases keep stable order
            const isGuesser = room.phase === 'guessing' && socketId !== room.hotSeat.playerId;
            filtered.hotSeat = {
                playerId: room.hotSeat.playerId,
                revealIndex: room.hotSeat.revealIndex,
                revealedPositions: room.hotSeat.revealedPositions || [],
                roundScores: room.hotSeat.roundScores,
                perfectGuessers: room.hotSeat.perfectGuessers || [],
                readyPlayers: room.hotSeat.readyPlayers || [],
                assignment: hotSeatPlayer.assignment,
                cards: isGuesser ? shuffle([...baseCards]) : baseCards,
            };

            // During reveal: include revealed cards by position + player's own guess
            if (room.phase === 'reveal' || room.phase === 'scores') {
                const fullRanking = hotSeatPlayer.ranking || [];
                const positions = room.hotSeat.revealedPositions || [];
                // Build sparse revealed ranking: only include cards at revealed positions
                const revealed = {};
                for (const pos of positions) {
                    revealed[pos] = fullRanking[pos];
                }
                filtered.hotSeat.revealedRanking = revealed;

                // Include this player's guess so they can see their own accuracy
                const requestingPlayer = room.players[socketId];
                if (requestingPlayer && requestingPlayer.currentGuess && socketId !== room.hotSeat.playerId) {
                    filtered.hotSeat.myGuess = requestingPlayer.currentGuess;
                }
            }
        }
    }

    return filtered;
}

export function emitRoomUpdate(io, room) {
    for (const socketId of Object.keys(room.players)) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            const filtered = filterRoomForPlayer(room, socketId);
            socket.emit('room_updated', { room: filtered });
        }
    }
}
