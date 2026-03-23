import { useState, useEffect } from 'react';
import useGameState from '../../hooks/useGameState.js';
import PageLayout from '../ui/PageLayout.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

function CountUpNumber({ value }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (value === 0) { setDisplay(0); return; }
        let start = 0;
        const step = Math.max(1, Math.ceil(value / 20));
        const interval = setInterval(() => {
            start = Math.min(start + step, value);
            setDisplay(start);
            if (start >= value) clearInterval(interval);
        }, 30);
        return () => clearInterval(interval);
    }, [value]);
    return <span className="animate-count-pop inline-block">{display}</span>;
}

export default function EndScreen() {
    const { room, players, playAgain, leaveRoom } = useGameState();

    if (!room) return null;

    const isCoop = room.mode === 'coop';
    const leaderboard = [...players].sort((a, b) => b.score - a.score);
    const winner = leaderboard[0];
    const isTie = leaderboard.length > 1 && leaderboard[0].score === leaderboard[1].score;

    // Coop: calculate connection percentage
    // Max per spotlight turn = 10 (guesser: 5×2 exact) + 5 (spotlight: 1 guesser × 5 exact matches) = 15
    // Two spotlight turns per round = 30
    const maxPerRound = 30;
    const totalRounds = room.totalRounds || 1;
    const maxScore = maxPerRound * totalRounds;
    const combinedScore = players.reduce((sum, p) => sum + p.score, 0);
    const connectionPct = Math.min(100, Math.round((combinedScore / maxScore) * 100));

    function getConnectionLabel(pct) {
        if (pct >= 90) return { emoji: '💕', label: 'Soulmates' };
        if (pct >= 70) return { emoji: '🤝', label: 'Best Friends' };
        if (pct >= 50) return { emoji: '😊', label: 'Getting There' };
        return { emoji: '🤔', label: 'Just Met?' };
    }

    const connection = getConnectionLabel(connectionPct);

    return (
        <PageLayout>
            <div className="w-full max-w-md animate-fade-in">
                {isCoop ? (
                    <>
                        {/* Coop result */}
                        <div className="text-center mb-6">
                            <div className="text-6xl mb-3">{connection.emoji}</div>
                            <h2 className="font-display text-3xl font-bold text-charcoal mb-2">{connection.label}</h2>
                            <p className="text-charcoal/60 text-lg font-medium">
                                Connection Score: <span className="font-display text-amber font-bold">{combinedScore}</span>
                            </p>
                            <p className="text-charcoal/40 text-sm mt-1">{connectionPct}% connection</p>
                        </div>

                        <Card className="mb-6">
                            <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-3 text-center font-medium">
                                Breakdown
                            </h3>
                            <div className="space-y-3">
                                {players.map((player) => (
                                    <div key={player.id} className="flex items-center gap-3 px-3 py-2">
                                        <span className="text-charcoal flex-1 font-medium">{player.name}</span>
                                        <span className="text-amber font-bold text-lg">
                                            <CountUpNumber value={player.score} />
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </>
                ) : (
                    <>
                        {/* Competitive result */}
                        <div className="text-center mb-6">
                            <div className="text-6xl mb-3">&#x1F3C6;</div>
                            <h2 className="font-display text-3xl font-bold text-charcoal mb-2">Game Over!</h2>
                            {isTie ? (
                                <p className="text-charcoal/60 text-lg font-medium">It&apos;s a tie!</p>
                            ) : (
                                <p className="text-charcoal/60 text-lg font-medium">
                                    <span className="font-display text-amber font-bold">{winner?.name}</span> wins with {winner?.score} points!
                                </p>
                            )}
                        </div>

                        <Card className="mb-6">
                            <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-3 text-center font-medium">
                                Final Standings
                            </h3>
                            <div className="space-y-3">
                                {leaderboard.map((player, i) => {
                                    const isWinner = i === 0 && !isTie;
                                    return (
                                        <div
                                            key={player.id}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-xl
                                                ${isWinner ? 'bg-amber-light border-2 border-amber' : ''}`}
                                        >
                                            <span className="text-amber font-bold w-8 text-right">
                                                {i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}.`}
                                            </span>
                                            <span className={`flex-1 font-medium ${isWinner ? 'text-charcoal text-lg' : 'text-charcoal'}`}>
                                                {player.name}
                                            </span>
                                            <span className={`font-bold ${isWinner ? 'text-amber text-xl' : 'text-charcoal text-lg'}`}>
                                                <CountUpNumber value={player.score} />
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </>
                )}

                {/* Action buttons */}
                <div className="space-y-3">
                    <Button onClick={playAgain}>
                        Play Again
                    </Button>
                    <Button variant="ghost" onClick={leaveRoom}>
                        Leave Room
                    </Button>
                </div>
            </div>
        </PageLayout>
    );
}
