import { useState } from 'react';
import useGameState from '../../hooks/useGameState.js';

export default function HostSidebar() {
    const { room, players, isHost, kickPlayer, endGame } = useGameState();
    const [open, setOpen] = useState(false);

    if (!isHost || !room || room.phase === 'lobby' || room.phase === 'game_end') return null;

    const myId = Object.values(room.players).find((p) => p.sessionToken)?.id;

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={() => setOpen(true)}
                className="fixed top-4 right-4 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-card border-2 border-amber shadow-card hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                aria-label="Host controls"
            >
                <span className="text-lg">👑</span>
            </button>

            {/* Backdrop + Panel */}
            {open && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-charcoal/30"
                        onClick={() => setOpen(false)}
                    />

                    {/* Sidebar panel */}
                    <div className="relative w-72 max-w-[80vw] bg-card h-full shadow-xl flex flex-col animate-slide-in-right">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-surface">
                            <h2 className="font-display text-lg font-bold text-charcoal flex items-center gap-2">
                                <span>👑</span> Host Controls
                            </h2>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface transition text-charcoal/40 hover:text-charcoal cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Players */}
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            <h3 className="text-charcoal/40 text-xs uppercase tracking-wide font-medium mb-3">Players</h3>
                            <div className="space-y-2 mb-6">
                                {players.map((player) => (
                                    <div key={player.id} className="flex items-center gap-2">
                                        <span className={`flex-1 text-sm font-medium truncate ${player.connected ? 'text-charcoal' : 'text-charcoal/30'}`}>
                                            {player.name}
                                            {player.id === myId && (
                                                <span className="text-xs text-amber ml-1">(you)</span>
                                            )}
                                            {!player.connected && (
                                                <span className="text-xs text-charcoal/30 ml-1">offline</span>
                                            )}
                                            {player.guesserOnly && (
                                                <span className="text-xs text-charcoal/30 ml-1">guesser</span>
                                            )}
                                        </span>
                                        {player.id !== myId && (
                                            <button
                                                onClick={() => kickPlayer(player.id)}
                                                className="text-charcoal/20 hover:text-red-500 transition text-sm cursor-pointer"
                                                title={`Kick ${player.name}`}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Game Controls */}
                            <h3 className="text-charcoal/40 text-xs uppercase tracking-wide font-medium mb-3">Game Controls</h3>
                            <div className="space-y-2">
                                <button
                                    onClick={() => { endGame(); setOpen(false); }}
                                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-charcoal hover:bg-surface transition cursor-pointer"
                                >
                                    🏁 End Game
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
