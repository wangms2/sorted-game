import { useState } from 'react';
import useGameState from '../../hooks/useGameState.js';
import PageLayout from '../ui/PageLayout.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

export default function LobbyScreen() {
    const { room, isHost, players, playerCount, startGame, leaveRoom } = useGameState();
    const [totalRounds, setTotalRounds] = useState(1);
    const [timerSeconds, setTimerSeconds] = useState(60);
    const [rulesOpen, setRulesOpen] = useState(false);

    if (!room) return null;

    const shareURL = `${window.location.origin}${window.location.pathname}?room=${room.code}`;

    return (
        <PageLayout>
            <Card className="w-full max-w-md animate-fade-in">
                <h2 className="font-display text-2xl font-bold text-charcoal mb-1">Lobby</h2>
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-charcoal/50">Room Code:</span>
                    <span className="font-display text-3xl tracking-widest text-charcoal bg-surface px-4 py-1 rounded-xl select-all font-bold">
                        {room.code}
                    </span>
                </div>
                <button
                    onClick={() => navigator.clipboard.writeText(shareURL)}
                    className="text-xs text-amber hover:text-amber/80 transition cursor-pointer mb-6 font-medium"
                >
                    Copy invite link
                </button>

                {/* Collapsible How to Play */}
                <div className="mb-6">
                    <button
                        onClick={() => setRulesOpen(!rulesOpen)}
                        className="w-full flex items-center justify-between text-charcoal/50 text-sm uppercase tracking-wide font-medium cursor-pointer hover:text-charcoal/70 transition"
                    >
                        <span>How to Play</span>
                        <span className={`transition-transform ${rulesOpen ? 'rotate-180' : ''}`}>&#x25BC;</span>
                    </button>
                    {rulesOpen && (
                        <div className="mt-2 bg-surface rounded-xl p-4 space-y-4">
                            <div>
                                <h4 className="text-charcoal/70 text-xs uppercase tracking-wide font-semibold mb-1">3+ Players &mdash; Competitive</h4>
                                <ol className="space-y-1 text-charcoal/60 text-sm list-decimal list-inside">
                                    <li>Each player gets a category and 5 cards to rank privately.</li>
                                    <li>One player enters the <span className="font-semibold text-amber">Spotlight</span>. Everyone else guesses how they ranked.</li>
                                    <li>The Spotlight player reveals their order one by one and explains their choices.</li>
                                    <li>Guessers: <span className="font-semibold">+2</span> exact, <span className="font-semibold">+1</span> off by one. Spotlight: <span className="font-semibold">+1</span> per exact match by any guesser.</li>
                                    <li>Everyone takes a turn in the Spotlight. After all rounds, the highest score wins!</li>
                                </ol>
                            </div>
                            <div>
                                <h4 className="text-charcoal/70 text-xs uppercase tracking-wide font-semibold mb-1">2 Players &mdash; Duo Mode</h4>
                                <ol className="space-y-1 text-charcoal/60 text-sm list-decimal list-inside">
                                    <li>You each get a category and 5 cards to rank privately.</li>
                                    <li>Take turns in the Spotlight &mdash; your partner guesses your ranking.</li>
                                    <li>The Spotlight player reveals their order and explains their choices.</li>
                                    <li>Guessers: <span className="font-semibold">+2</span> exact, <span className="font-semibold">+1</span> off by one. Spotlight: <span className="font-semibold">+1</span> per card your partner places exactly right.</li>
                                    <li>After all rounds, see how strong your connection is!</li>
                                </ol>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mb-6">
                    <h3 className="text-charcoal/50 text-sm mb-2 uppercase tracking-wide font-medium">
                        Players ({playerCount}/10)
                    </h3>
                    <ul className="space-y-2">
                        {players.map((p) => (
                            <li
                                key={p.id}
                                className="flex items-center gap-2 bg-surface rounded-xl px-4 py-2"
                            >
                                <span className="text-charcoal font-medium">{p.name}</span>
                                {p.id === room.hostId && (
                                    <span className="text-xs bg-amber text-white px-2 py-0.5 rounded-lg font-medium">
                                        Host
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {isHost && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-charcoal/50 text-sm block mb-1 font-medium">Rounds</label>
                            <div className="flex gap-2">
                                {[1, 2, 3].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setTotalRounds(n)}
                                        className={`flex-1 py-2 rounded-xl font-semibold transition cursor-pointer ${totalRounds === n
                                            ? 'bg-amber text-white'
                                            : 'bg-surface text-charcoal hover:bg-surface/70'
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-charcoal/50 text-sm block mb-1 font-medium">Timer</label>
                            <div className="flex gap-2">
                                {[{ val: 45, label: '45s' }, { val: 60, label: '60s' }, { val: 90, label: '90s' }].map(({ val, label }) => (
                                    <button
                                        key={val}
                                        onClick={() => setTimerSeconds(val)}
                                        className={`flex-1 py-2 rounded-xl font-semibold transition cursor-pointer ${timerSeconds === val
                                            ? 'bg-amber text-white'
                                            : 'bg-surface text-charcoal hover:bg-surface/70'
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Button
                            onClick={() => startGame(totalRounds, timerSeconds)}
                            disabled={playerCount < 2}
                        >
                            {playerCount < 2
                                ? 'Need 1 more player'
                                : 'Start Game'}
                        </Button>
                        {playerCount >= 2 && (
                            <p className="text-charcoal/40 text-xs text-center mt-1 font-medium">
                                {playerCount === 2 ? '🤝 Duo Mode' : '⚔️ Competitive'}
                            </p>
                        )}
                    </div>
                )}

                {!isHost && (
                    <p className="text-charcoal/50 text-center font-medium">
                        Waiting for host to start the game...
                    </p>
                )}

                <button
                    onClick={leaveRoom}
                    className="w-full mt-4 py-2 text-charcoal/40 hover:text-charcoal transition text-sm cursor-pointer"
                >
                    Leave Room
                </button>
            </Card>
        </PageLayout>
    );
}
