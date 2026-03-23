import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { EVENTS } from '../shared/socketEvents.js';
import {
    createRoom,
    joinRoom,
    getRoomBySocketId,
    reconnectPlayer,
    handleDisconnect,
    emitRoomUpdate,
} from './roomManager.js';
import {
    startGame,
    submitRanking,
    checkAllRanked,
    submitGuess,
    checkAllGuessed,
    revealNext,
    advanceFromScores,
    playerReady,
    playAgain,
    scheduleAutoReveal,
    cancelAutoReveal,
} from './gameEngine.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// Serve built client in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res, next) => {
    // Only serve index.html for non-API/non-socket requests
    if (_req.path.startsWith('/socket.io') || _req.path === '/health') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);

    socket.on(EVENTS.CREATE_ROOM, (data) => {
        const { playerName } = data || {};
        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0 || playerName.trim().length > 20) {
            socket.emit(EVENTS.ERROR, { message: 'Name must be 1-20 characters' });
            return;
        }
        const room = createRoom(playerName.trim(), socket.id);
        socket.join(room.code);
        emitRoomUpdate(io, room);
    });

    socket.on(EVENTS.JOIN_ROOM, (data) => {
        const { roomCode, playerName } = data || {};
        if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0 || playerName.trim().length > 20) {
            socket.emit(EVENTS.ERROR, { message: 'Name must be 1-20 characters' });
            return;
        }
        if (!roomCode || typeof roomCode !== 'string') {
            socket.emit(EVENTS.ERROR, { message: 'Room code is required' });
            return;
        }
        const result = joinRoom(roomCode.trim().toUpperCase(), playerName.trim(), socket.id);
        if (result.error) {
            socket.emit(EVENTS.ERROR, { message: result.error });
            return;
        }
        socket.join(result.room.code);
        emitRoomUpdate(io, result.room);
    });

    socket.on(EVENTS.RECONNECT, (data) => {
        const { sessionToken, roomCode } = data || {};
        if (!sessionToken || !roomCode) {
            socket.emit(EVENTS.ERROR, { message: 'Invalid reconnect data' });
            return;
        }
        const result = reconnectPlayer(sessionToken, roomCode, socket.id);
        if (result.error) {
            socket.emit(EVENTS.ERROR, { message: result.error });
            return;
        }
        socket.join(result.room.code);
        // Cancel auto-reveal if hot seat player reconnected during reveal
        if (result.room.phase === 'reveal' && result.room.hotSeat &&
            result.room.hotSeat.playerId === socket.id) {
            cancelAutoReveal(result.room);
        }
        emitRoomUpdate(io, result.room);
    });

    socket.on(EVENTS.START_GAME, (data) => {
        const { totalRounds, timerSeconds } = data || {};
        const room = getRoomBySocketId(socket.id);
        if (!room) { socket.emit(EVENTS.ERROR, { message: 'Not in a room' }); return; }
        if (room.hostId !== socket.id) { socket.emit(EVENTS.ERROR, { message: 'Only host can start' }); return; }
        if (room.phase !== 'lobby') { socket.emit(EVENTS.ERROR, { message: 'Game already started' }); return; }

        // Apply timer setting if provided (30, 60, or 90 seconds)
        const allowedTimers = [30, 45, 60, 90];
        if (typeof timerSeconds === 'number' && allowedTimers.includes(timerSeconds)) {
            room.settings.rankingTimerSeconds = timerSeconds;
            room.settings.guessingTimerSeconds = timerSeconds;
        }

        const result = startGame(room, typeof totalRounds === 'number' ? totalRounds : 1, io, emitRoomUpdate);
        if (result.error) { socket.emit(EVENTS.ERROR, { message: result.error }); return; }
        emitRoomUpdate(io, room);
    });

    socket.on(EVENTS.SUBMIT_RANKING, (data) => {
        const { ranking } = data || {};
        const room = getRoomBySocketId(socket.id);
        if (!room) { socket.emit(EVENTS.ERROR, { message: 'Not in a room' }); return; }

        const result = submitRanking(room, socket.id, ranking);
        if (result.error) { socket.emit(EVENTS.ERROR, { message: result.error }); return; }
        const transitioned = checkAllRanked(room, io, emitRoomUpdate);
        if (!transitioned) emitRoomUpdate(io, room);
    });

    socket.on(EVENTS.SUBMIT_GUESS, (data) => {
        const { guess } = data || {};
        const room = getRoomBySocketId(socket.id);
        if (!room) { socket.emit(EVENTS.ERROR, { message: 'Not in a room' }); return; }

        const result = submitGuess(room, socket.id, guess);
        if (result.error) { socket.emit(EVENTS.ERROR, { message: result.error }); return; }
        const transitioned = checkAllGuessed(room, io, emitRoomUpdate);
        if (!transitioned) emitRoomUpdate(io, room);
    });

    socket.on(EVENTS.REVEAL_NEXT, (data) => {
        const { positionIndex } = data || {};
        const room = getRoomBySocketId(socket.id);
        if (!room) { socket.emit(EVENTS.ERROR, { message: 'Not in a room' }); return; }

        const result = revealNext(room, socket.id, io, emitRoomUpdate, typeof positionIndex === 'number' ? positionIndex : undefined);
        if (result.error) { socket.emit(EVENTS.ERROR, { message: result.error }); return; }
        // emitRoomUpdate already called inside revealNext
    });

    socket.on(EVENTS.ADVANCE_ROUND, () => {
        const room = getRoomBySocketId(socket.id);
        if (!room) { socket.emit(EVENTS.ERROR, { message: 'Not in a room' }); return; }

        // During reveal phase (all revealed), use playerReady
        if (room.phase === 'reveal' && room.hotSeat && room.hotSeat.revealIndex >= 5) {
            const result = playerReady(room, socket.id, io, emitRoomUpdate);
            if (result && result.error) { socket.emit(EVENTS.ERROR, { message: result.error }); return; }
            return;
        }

        // During scores phase, host advances directly
        if (room.hostId !== socket.id) { socket.emit(EVENTS.ERROR, { message: 'Only host can advance' }); return; }
        const result = advanceFromScores(room, io, emitRoomUpdate);
        if (result && result.error) { socket.emit(EVENTS.ERROR, { message: result.error }); return; }
    });

    socket.on(EVENTS.PLAY_AGAIN, () => {
        const room = getRoomBySocketId(socket.id);
        if (!room) { socket.emit(EVENTS.ERROR, { message: 'Not in a room' }); return; }

        const result = playAgain(room, io, emitRoomUpdate);
        if (result.error) { socket.emit(EVENTS.ERROR, { message: result.error }); return; }
        emitRoomUpdate(io, room);
    });

    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.id}`);
        const room = getRoomBySocketId(socket.id);
        const wasHotSeatInReveal = room && room.phase === 'reveal' &&
            room.hotSeat && room.hotSeat.playerId === socket.id;
        handleDisconnect(socket.id, io, emitRoomUpdate);
        if (wasHotSeatInReveal) {
            scheduleAutoReveal(room, io, emitRoomUpdate);
        }
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
