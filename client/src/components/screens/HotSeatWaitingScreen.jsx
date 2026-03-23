import useGameState from '../../hooks/useGameState.js';
import Timer from '../ui/Timer.jsx';
import PageLayout from '../ui/PageLayout.jsx';
import Card from '../ui/Card.jsx';

export default function HotSeatWaitingScreen() {
    const { room, myPlayer, players } = useGameState();
    const hotSeat = room?.hotSeat;

    if (!room || !myPlayer || !hotSeat) return null;

    const unguessed = players.filter(
        (p) => !p.hasGuessed && p.connected && p.id !== hotSeat.playerId
    );
    const guessed = players.filter(
        (p) => p.hasGuessed && p.id !== hotSeat.playerId
    );

    return (
        <PageLayout>
            <Card className="w-full max-w-md text-center animate-fade-in">
                <h2 className="font-display text-3xl font-bold text-charcoal mb-2">You&apos;re in the Spotlight!</h2>
                <p className="text-charcoal/50 mb-2">
                    Others are guessing how you ranked your cards.
                </p>
                <p className="text-charcoal/40 text-sm mb-6">
                    {myPlayer.assignment?.name}
                </p>

                <div className="mb-6">
                    <Timer timerEndAt={room.timerEndAt} />
                </div>

                {/* Progress */}
                <div className="space-y-4">
                    {guessed.length > 0 && (
                        <div>
                            <h3 className="text-correct text-sm uppercase tracking-wide mb-2 font-medium">
                                Guessed ({guessed.length})
                            </h3>
                            <div className="flex flex-wrap justify-center gap-2">
                                {guessed.map((p) => (
                                    <span key={p.id} className="bg-correct-light text-correct px-3 py-1 rounded-lg text-sm font-medium">
                                        {p.name} &#x2713;
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {unguessed.length > 0 && (
                        <div>
                            <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-2 font-medium">
                                Still guessing ({unguessed.length})
                            </h3>
                            <div className="flex flex-wrap justify-center gap-2">
                                {unguessed.map((p) => (
                                    <span key={p.id} className="bg-surface text-charcoal/60 px-3 py-1 rounded-lg text-sm font-medium">
                                        {p.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        </PageLayout>
    );
}
