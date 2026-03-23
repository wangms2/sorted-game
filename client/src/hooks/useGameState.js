import { useContext, useMemo } from 'react';
import { GameContext } from '../context/GameContext.jsx';

export default function useGameState() {
    const ctx = useContext(GameContext);
    const { room } = ctx;

    return useMemo(() => {
        if (!room) {
            return {
                ...ctx,
                myPlayer: null,
                isHost: false,
                isHotSeat: false,
                currentPhase: null,
                playerCount: 0,
                players: [],
            };
        }

        const myPlayer = Object.values(room.players).find((p) => p.sessionToken) || null;
        const myId = myPlayer?.id;
        const isHost = room.hostId === myId;
        const isHotSeat = room.hotSeat?.playerId === myId;
        const players = room.playerOrder
            .map((id) => room.players[id])
            .filter(Boolean);

        return {
            ...ctx,
            myPlayer,
            isHost,
            isHotSeat,
            currentPhase: room.phase,
            playerCount: players.length,
            players,
        };
    }, [room, ctx]);
}
