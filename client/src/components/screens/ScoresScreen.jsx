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

export default function ScoresScreen() {
    const { room, isHost, players, advanceRound } = useGameState();
    const hotSeat = room?.hotSeat;
    const isCoop = room?.mode === 'coop';

    if (!room) return null;

    const hotSeatName = hotSeat ? room.players[hotSeat.playerId]?.name : null;

    // Round scores from this spotlight cycle
    const roundScoreEntries = hotSeat
        ? Object.entries(hotSeat.roundScores || {})
            .map(([id, pts]) => ({
                name: room.players[id]?.name || 'Unknown',
                points: pts,
                isHotSeat: id === hotSeat.playerId,
            }))
            .sort((a, b) => b.points - a.points)
        : [];

    // Cumulative leaderboard
    const leaderboard = [...players]
        .sort((a, b) => b.score - a.score);

    // Info about what's next
    const hotSeatIndex = room.hotSeatIndex;
    const totalPlayers = room.playerOrder.length;
    const currentRound = room.currentRoundNumber;
    const totalRounds = room.totalRounds;
    const moreHotSeats = hotSeatIndex < totalPlayers - 1;

    return (
        <PageLayout>
            <div className="w-full max-w-md animate-fade-in">
                {/* Header */}
                <div className="text-center mb-5">
                    {hotSeatName && (
                        <p className="text-charcoal/50 text-sm uppercase tracking-wide mb-1 font-medium">
                            {hotSeatName}&apos;s Spotlight Results
                        </p>
                    )}
                    <h2 className="font-display text-2xl font-bold text-charcoal">Round Scores</h2>
                </div>

                {/* Round scores from this cycle */}
                {roundScoreEntries.length > 0 && (
                    <Card className="mb-4">
                        <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-3 text-center font-medium">
                            This Round
                        </h3>
                        <div className="space-y-2">
                            {roundScoreEntries.map((entry, i) => (
                                <div key={entry.name} className="flex items-center gap-3 px-2 py-1">
                                    <span className="text-amber font-bold w-6 text-right text-sm">
                                        {i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}.`}
                                    </span>
                                    <span className="text-charcoal flex-1 font-medium">
                                        {entry.name}
                                        {entry.isHotSeat && <span className="text-amber text-xs ml-1">&#x2605;</span>}
                                    </span>
                                    <span className="text-amber font-semibold">
                                        +<CountUpNumber value={entry.points} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Cumulative leaderboard / Connection Score */}
                <Card className="mb-5">
                    {isCoop ? (
                        <>
                            <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-3 text-center font-medium">
                                Connection Score
                            </h3>
                            <div className="text-center">
                                <span className="font-display text-4xl font-bold text-amber">
                                    <CountUpNumber value={players.reduce((sum, p) => sum + p.score, 0)} />
                                </span>
                                <p className="text-charcoal/50 text-sm mt-1 font-medium">combined points</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-3 text-center font-medium">
                                Overall Standings
                            </h3>
                            <div className="space-y-2">
                                {leaderboard.map((player, i) => (
                                    <div key={player.id} className="flex items-center gap-3 px-2 py-1">
                                        <span className="text-amber font-bold w-6 text-right text-sm">
                                            {i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}.`}
                                        </span>
                                        <span className="text-charcoal flex-1 font-medium">{player.name}</span>
                                        <span className="text-charcoal font-bold">
                                            <CountUpNumber value={player.score} />
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </Card>

                {/* What's next info + host advance button */}
                <div className="text-center">
                    <p className="text-charcoal/50 text-sm mb-3 font-medium">
                        {moreHotSeats
                            ? `Next spotlight coming up... (Round ${currentRound}/${totalRounds})`
                            : currentRound < totalRounds
                                ? `Round ${currentRound} complete! Round ${currentRound + 1} starting soon...`
                                : 'Final scores coming up...'}
                    </p>

                    {isHost && (
                        <Button onClick={advanceRound}>
                            Next
                        </Button>
                    )}

                    {!isHost && (
                        <p className="text-charcoal/30 text-xs">Auto-advancing shortly...</p>
                    )}
                </div>
            </div>
        </PageLayout>
    );
}
