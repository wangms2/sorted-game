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

    const leaderboard = [...players].sort((a, b) => b.score - a.score);
    const winner = leaderboard[0];
    const isTie = leaderboard.length > 1 && leaderboard[0].score === leaderboard[1].score;

    return (
        <PageLayout>
            <div className="w-full max-w-md animate-fade-in">
                {/* Winner announcement */}
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

                {/* Final leaderboard */}
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
