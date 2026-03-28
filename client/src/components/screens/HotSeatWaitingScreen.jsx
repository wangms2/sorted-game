import useGameState from '../../hooks/useGameState.js';
import Timer from '../ui/Timer.jsx';
import PageLayout from '../ui/PageLayout.jsx';

const GUESSER_COLORS = [
    '#E8732A', // amber/orange
    '#6366F1', // indigo
    '#0D9488', // teal
    '#DB2777', // pink
    '#7C3AED', // purple
    '#2563EB', // blue
    '#059669', // emerald
    '#DC2626', // red
    '#CA8A04', // yellow
    '#4F46E5', // violet
    '#0891B2', // cyan
    '#9333EA', // fuchsia
];

function GuesserBadge({ position, color, locked, accuracy }) {
    // accuracy: 0 = exact, 1 = off-by-one, 2+ = way off
    const isExact = accuracy === 0;
    const isFarOff = accuracy >= 2;
    return (
        <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white shrink-0
                ${locked ? 'ring-2 ring-white shadow-md' : ''}
                ${isExact ? 'ring-1 ring-amber ring-offset-1 ring-offset-white shadow-md' : ''}`}
            style={{
                backgroundColor: color,
                opacity: isFarOff ? 0.35 : 1,
                transition: 'all 300ms ease',
            }}
        >
            {position}
        </span>
    );
}

export default function HotSeatWaitingScreen() {
    const { room, myPlayer, players, guessPreview } = useGameState();
    const hotSeat = room?.hotSeat;

    if (!room || !myPlayer || !hotSeat) return null;

    const myId = myPlayer.id;

    // Build card lookup from myPlayer's cards
    const cardMap = {};
    if (myPlayer.cards) {
        for (const card of myPlayer.cards) {
            cardMap[card.id] = card;
        }
    }

    // Cards in the spotlight player's ranked order
    const rankedCardIds = myPlayer.ranking || myPlayer.cards?.map((c) => c.id) || [];

    // Guessers: all connected non-hot-seat players, in playerOrder
    const guessers = (room.playerOrder || [])
        .map((id) => room.players[id])
        .filter((p) => p && p.id !== myId && p.connected);

    // Assign colors by playerOrder index (consistent across screens)
    const guesserColors = {};
    (room.playerOrder || []).forEach((id, i) => {
        guesserColors[id] = GUESSER_COLORS[i % GUESSER_COLORS.length];
    });

    const unguessedCount = guessers.filter((p) => !p.hasGuessed).length;
    const totalGuessers = guessers.length;

    return (
        <PageLayout className="items-start">
            <div className="w-full max-w-md animate-fade-in">
                {/* Header */}
                <div className="text-center mb-4">
                    <div className="mb-3">
                        <Timer timerEndAt={room.timerEndAt} totalSeconds={room.settings?.guessingTimerSeconds} />
                    </div>
                    <h2 className="font-display text-2xl font-bold text-charcoal mb-1">You&apos;re in the Spotlight!</h2>
                    <p className="text-charcoal/50 text-sm mb-1">You ranked</p>
                    <p className="font-display text-lg font-bold text-charcoal mb-0.5">{myPlayer.assignment?.name}</p>
                    <p className="text-charcoal/40 text-xs">{myPlayer.assignment?.scale}</p>
                </div>

                {/* Player legend */}
                <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                    {guessers.map((g) => (
                        <span
                            key={g.id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-white"
                            style={{ backgroundColor: guesserColors[g.id] }}
                        >
                            {g.name}
                            {g.hasGuessed && <span>&#x2713;</span>}
                        </span>
                    ))}
                </div>

                {/* Ranked cards with guess badges */}
                <div className="bg-surface rounded-2xl p-3 mb-3">
                    <div className="space-y-2">
                        {rankedCardIds.map((cardId, index) => {
                            const card = cardMap[cardId];
                            return (
                                <div
                                    key={cardId}
                                    className="flex items-center gap-3 bg-card border-4 border-charcoal rounded-xl px-4 py-2.5"
                                >
                                    {/* Rank badge */}
                                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-amber text-white font-bold text-sm">
                                        {index + 1}
                                    </span>
                                    {/* Card text */}
                                    <span className="text-charcoal font-medium text-base flex-1 min-w-0">
                                        {card?.text || cardId}
                                    </span>
                                    {/* Guesser position badges */}
                                    <div className="flex flex-wrap gap-1 shrink-0">
                                        {guessers.map((g) => {
                                            const draft = guessPreview?.[g.id];
                                            if (!draft) return null;
                                            const guessPos = draft.guess.indexOf(cardId);
                                            if (guessPos === -1) return null;
                                            const accuracy = Math.abs((guessPos + 1) - (index + 1));
                                            return (
                                                <GuesserBadge
                                                    key={g.id}
                                                    position={guessPos + 1}
                                                    color={guesserColors[g.id]}
                                                    locked={draft.locked}
                                                    accuracy={accuracy}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Progress footer */}
                <p className="text-center text-charcoal/40 text-xs">
                    {unguessedCount > 0
                        ? `${totalGuessers - unguessedCount}/${totalGuessers} locked in`
                        : 'All guesses locked in!'}
                </p>
            </div>
        </PageLayout>
    );
}
