import { useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { EVENTS } from '@shared/socketEvents.js';

let socket = null;

function getSocket() {
    if (!socket) {
        socket = io('/', {
            autoConnect: false,
            transports: ['websocket', 'polling'],
        });
    }
    return socket;
}

export default function useSocket(onRoomUpdate, onError) {
    const onRoomUpdateRef = useRef(onRoomUpdate);
    const onErrorRef = useRef(onError);
    onRoomUpdateRef.current = onRoomUpdate;
    onErrorRef.current = onError;

    useEffect(() => {
        const s = getSocket();

        const handleRoomUpdate = (data) => onRoomUpdateRef.current?.(data);
        const handleError = (data) => onErrorRef.current?.(data);

        s.on(EVENTS.ROOM_UPDATED, handleRoomUpdate);
        s.on(EVENTS.ERROR, handleError);

        if (!s.connected) s.connect();

        return () => {
            s.off(EVENTS.ROOM_UPDATED, handleRoomUpdate);
            s.off(EVENTS.ERROR, handleError);
        };
    }, []);

    const emit = useCallback((event, data) => {
        getSocket().emit(event, data);
    }, []);

    const tryReconnect = useCallback(() => {
        const sessionToken = sessionStorage.getItem('rankit_sessionToken');
        const roomCode = sessionStorage.getItem('rankit_roomCode');
        if (sessionToken && roomCode) {
            emit(EVENTS.RECONNECT, { sessionToken, roomCode });
            return true;
        }
        return false;
    }, [emit]);

    const disconnect = useCallback(() => {
        const s = getSocket();
        if (s.connected) s.disconnect();
        socket = null; // Reset so next getSocket() creates a fresh connection
    }, []);

    return { emit, tryReconnect, disconnect };
}
