import { useState } from 'react';
import useGameState from '../../hooks/useGameState.js';
import PageLayout from '../ui/PageLayout.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

const TIMER_OPTIONS = [
    { val: 30, label: '30s' },
    { val: 45, label: '45s' },
    { val: 60, label: '60s' },
    { val: 90, label: '90s' },
    { val: 120, label: '120s' },
    { val: 0, label: '∞' },
];

function estimateMinutes(playerCount, rounds, timerSeconds) {
    const timerDuration = timerSeconds || 60; // assume ~60s pace if no timer
    const revealDiscussion = 135; // ~2 min reveal + 15s scores
    const perRound = timerDuration + playerCount * (timerDuration + revealDiscussion);
    return Math.round((perRound * rounds) / 60);
}

export default function LobbyScreen() {
    const { room, isHost, players, playerCount, startGame, leaveRoom, kickPlayer } = useGameState();
    const [totalRounds, setTotalRounds] = useState(1);
    const [customRounds, setCustomRounds] = useState('');
    const [showCustom, setShowCustom] = useState(false);
    const [timerSeconds, setTimerSeconds] = useState(60);
    const [rulesOpen, setRulesOpen] = useState(false);

    const timerIndex = TIMER_OPTIONS.findIndex((o) => o.val === timerSeconds);

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
                                    <li>You both guess each other&apos;s ranking at the same time.</li>
                                    <li>Take turns revealing your order and explaining your choices.</li>
                                    <li><span className="font-semibold">+2</span> per exact match, <span className="font-semibold">+1</span> per off-by-one.</li>
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
                                className={`flex items-center gap-2 bg-surface rounded-xl px-4 py-2 ${!p.connected ? 'opacity-40' : ''}`}
                            >
                                <span className="text-charcoal font-medium flex-1">{p.name}</span>
                                {!p.connected && (
                                    <span className="text-xs text-charcoal/40 font-medium">offline</span>
                                )}
                                {p.id === room.hostId && (
                                    <span className="text-xs bg-amber text-white px-2 py-0.5 rounded-lg font-medium">
                                        Host
                                    </span>
                                )}
                                {isHost && p.id !== room.hostId && (
                                    <button
                                        onClick={() => kickPlayer(p.id)}
                                        className="text-charcoal/30 hover:text-red-500 transition cursor-pointer text-xs font-medium"
                                        title="Kick player"
                                    >
                                        &#x2715;
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                {isHost && (
                    <div className="space-y-4">
                        {/* Rounds */}
                        <div>
                            <label className="text-charcoal/50 text-sm block mb-1 font-medium">Rounds</label>
                            <div className="flex gap-2">
                                {[1, 2, 3].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => { setTotalRounds(n); setShowCustom(false); }}
                                        className={`flex-1 py-2 rounded-xl font-semibold transition cursor-pointer ${!showCustom && totalRounds === n
                                            ? 'bg-amber text-white'
                                            : 'bg-surface text-charcoal hover:bg-surface/70'
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setShowCustom(!showCustom)}
                                    className={`flex-1 py-2 rounded-xl font-semibold transition cursor-pointer ${showCustom
                                        ? 'bg-amber text-white'
                                        : 'bg-surface text-charcoal hover:bg-surface/70'
                                        }`}
                                >
                                    #
                                </button>
                            </div>
                            {showCustom && (
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={customRounds}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setCustomRounds(v);
                                        const n = parseInt(v, 10);
                                        if (n >= 1 && n <= 10) setTotalRounds(n);
                                    }}
                                    placeholder="1–10"
                                    className="mt-2 w-full py-2 px-3 rounded-xl bg-surface text-charcoal text-center font-semibold outline-none focus:ring-2 focus:ring-amber/50"
                                />
                            )}
                        </div>

                        {/* Timer — discrete slider */}
                        <div>
                            <label className="text-charcoal/50 text-sm block mb-2 font-medium">Timer</label>
                            <div className="relative px-2">
                                {/* Track */}
                                <div className="absolute top-[9px] left-2 right-2 h-1 bg-surface rounded-full" />
                                <div
                                    className="absolute top-[9px] left-2 h-1 bg-amber rounded-full transition-all"
                                    style={{ width: `${(timerIndex / (TIMER_OPTIONS.length - 1)) * 100}%` }}
                                />
                                {/* Tick marks + labels */}
                                <div className="relative flex justify-between">
                                    {TIMER_OPTIONS.map((opt, i) => (
                                        <button
                                            key={opt.val}
                                            onClick={() => setTimerSeconds(opt.val)}
                                            className="flex flex-col items-center cursor-pointer group"
                                        >
                                            <div
                                                className={`w-5 h-5 rounded-full border-2 transition ${i <= timerIndex
                                                    ? 'bg-amber border-amber'
                                                    : 'bg-white border-surface group-hover:border-amber/50'
                                                    }`}
                                            />
                                            <span className={`text-xs mt-1 font-medium transition ${timerSeconds === opt.val
                                                ? 'text-amber'
                                                : 'text-charcoal/40'
                                                }`}>
                                                {opt.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Time estimate */}
                        {playerCount >= 2 && (
                            <p className="text-charcoal/40 text-xs text-center font-medium">
                                ~{estimateMinutes(playerCount, totalRounds, timerSeconds)} min
                                {totalRounds > 1 ? ` · ~${estimateMinutes(playerCount, 1, timerSeconds)} min/round` : ''}
                            </p>
                        )}

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
