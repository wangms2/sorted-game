import { createContext, useState, useCallback, useEffect, useRef } from 'react';
import useSocket from '../hooks/useSocket.js';
import { EVENTS } from '@shared/socketEvents.js';

export const GameContext = createContext(null);

export function GameProvider({ children }) {
    const [room, setRoom] = useState(null);
    const [error, setError] = useState(null);
    const [guessPreview, setGuessPreview] = useState(null);
    const errorTimerRef = useRef(null);

    const handleRoomUpdate = useCallback(({ room: roomData }) => {
        setRoom(roomData);
        if (roomData.phase !== 'guessing') setGuessPreview(null);
        // Persist session info for reconnection
        const myPlayer = Object.values(roomData.players).find((p) => p.sessionToken);
        if (myPlayer) {
            sessionStorage.setItem('rankit_sessionToken', myPlayer.sessionToken);
            sessionStorage.setItem('rankit_roomCode', roomData.code);
        }
        // Update URL with room code for shareable links
        const url = new URL(window.location);
        if (roomData.code && url.searchParams.get('room') !== roomData.code) {
            url.searchParams.set('room', roomData.code);
            window.history.replaceState({}, '', url);
        }
    }, []);

    const handleError = useCallback(({ message }) => {
        // Clear stale session if room/session no longer exists
        if (message === 'Room not found' || message === 'Session not found') {
            sessionStorage.removeItem('rankit_sessionToken');
            sessionStorage.removeItem('rankit_roomCode');
            const url = new URL(window.location);
            url.searchParams.delete('room');
            window.history.replaceState({}, '', url.pathname);
        }
        setError(message);
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setError(null), 4000);
    }, []);

    const handleGuessPreview = useCallback(({ drafts }) => {
        setGuessPreview(drafts);
    }, []);

    const { emit, tryReconnect, disconnect } = useSocket(handleRoomUpdate, handleError, handleGuessPreview);

    // Attempt reconnection on mount
    useEffect(() => {
        tryReconnect();
    }, [tryReconnect]);

    const createRoom = useCallback(
        (playerName) => emit(EVENTS.CREATE_ROOM, { playerName }),
        [emit]
    );

    const joinRoom = useCallback(
        (roomCode, playerName) => emit(EVENTS.JOIN_ROOM, { roomCode, playerName }),
        [emit]
    );

    const startGame = useCallback(
        (totalRounds, timerSeconds) => emit(EVENTS.START_GAME, { totalRounds, timerSeconds }),
        [emit]
    );

    const updateSettings = useCallback(
        (totalRounds, timerSeconds) => emit(EVENTS.UPDATE_SETTINGS, { totalRounds, timerSeconds }),
        [emit]
    );

    const submitRanking = useCallback(
        (ranking) => emit(EVENTS.SUBMIT_RANKING, { ranking }),
        [emit]
    );

    const submitGuess = useCallback(
        (guess) => emit(EVENTS.SUBMIT_GUESS, { guess }),
        [emit]
    );

    const syncRanking = useCallback(
        (ranking) => emit(EVENTS.SYNC_RANKING, { ranking }),
        [emit]
    );

    const syncGuess = useCallback(
        (guess) => emit(EVENTS.SYNC_GUESS, { guess }),
        [emit]
    );

    const revealNext = useCallback((positionIndex) => emit(EVENTS.REVEAL_NEXT, { positionIndex }), [emit]);

    const advanceRound = useCallback(() => emit(EVENTS.ADVANCE_ROUND), [emit]);

    const playAgain = useCallback(() => emit(EVENTS.PLAY_AGAIN), [emit]);

    const kickPlayer = useCallback(
        (targetId) => emit(EVENTS.KICK_PLAYER, { targetId }),
        [emit]
    );

    const rejoinAs = useCallback(
        (targetPlayerId) => emit(EVENTS.REJOIN_AS, { targetPlayerId }),
        [emit]
    );

    const joinAsGuesser = useCallback(
        () => emit(EVENTS.JOIN_AS_GUESSER),
        [emit]
    );

    const endGame = useCallback(
        () => emit(EVENTS.END_GAME),
        [emit]
    );

    const leaveRoom = useCallback(() => {
        disconnect();
        setRoom(null);
        sessionStorage.removeItem('rankit_sessionToken');
        sessionStorage.removeItem('rankit_roomCode');
        // Clear room code from URL
        const url = new URL(window.location);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.pathname);
    }, [disconnect]);

    const clearError = useCallback(() => setError(null), []);

    return (
        <GameContext.Provider
            value={{
                room,
                error,
                guessPreview,
                createRoom,
                joinRoom,
                startGame,
                updateSettings,
                submitRanking,
                syncRanking,
                submitGuess,
                syncGuess,
                revealNext,
                advanceRound,
                playAgain,
                kickPlayer,
                rejoinAs,
                joinAsGuesser,
                endGame,
                leaveRoom,
                clearError,
            }}
        >
            {children}
        </GameContext.Provider>
    );
}
