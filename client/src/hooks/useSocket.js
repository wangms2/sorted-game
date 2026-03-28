import { useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { EVENTS } from '@shared/socketEvents.js';

let socket = null;
let listenersAttached = false;

function getSocket() {
    if (!socket) {
        socket = io('/', {
            autoConnect: false,
            transports: ['websocket', 'polling'],
        });
        listenersAttached = false;
    }
    return socket;
}

export default function useSocket(onRoomUpdate, onError, onGuessPreview) {
    const onRoomUpdateRef = useRef(onRoomUpdate);
    const onErrorRef = useRef(onError);
    const onGuessPreviewRef = useRef(onGuessPreview);
    onRoomUpdateRef.current = onRoomUpdate;
    onErrorRef.current = onError;
    onGuessPreviewRef.current = onGuessPreview;

    const ensureListeners = useCallback((s) => {
        if (listenersAttached) return;
        s.on(EVENTS.ROOM_UPDATED, (data) => onRoomUpdateRef.current?.(data));
        s.on(EVENTS.ERROR, (data) => onErrorRef.current?.(data));
        s.on(EVENTS.GUESS_PREVIEW, (data) => onGuessPreviewRef.current?.(data));
        listenersAttached = true;
    }, []);

    useEffect(() => {
        const s = getSocket();
        ensureListeners(s);
        if (!s.connected) s.connect();
    }, [ensureListeners]);

    const emit = useCallback((event, data) => {
        const s = getSocket();
        ensureListeners(s);
        if (!s.connected) s.connect();
        s.emit(event, data);
    }, [ensureListeners]);

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
        socket = null;
        listenersAttached = false;
    }, []);

    return { emit, tryReconnect, disconnect };
}
