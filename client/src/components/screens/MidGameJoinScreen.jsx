import useGameState from '../../hooks/useGameState.js';
import PageLayout from '../ui/PageLayout.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

export default function MidGameJoinScreen() {
    const { myPlayer, rejoinAs, joinAsGuesser, leaveRoom } = useGameState();

    if (!myPlayer) return null;

    const joinOptions = myPlayer.joinOptions || {};
    const disconnectedPlayers = joinOptions.disconnectedPlayers || [];
    const canJoinAsGuesser = joinOptions.canJoinAsGuesser !== false;

    return (
        <PageLayout>
            <Card className="w-full max-w-md animate-fade-in">
                <h2 className="font-display text-3xl font-bold text-center text-charcoal mb-2">
                    Game in Progress
                </h2>
                <p className="text-center text-charcoal/60 mb-6 font-medium">
                    Choose how to join
                </p>

                {disconnectedPlayers.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-3 font-medium">
                            Take Over a Player
                        </h3>
                        <div className="space-y-2">
                            {disconnectedPlayers.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => rejoinAs(p.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface hover:bg-amber-light border-2 border-transparent hover:border-amber transition-all text-left"
                                >
                                    <span className="text-charcoal/30">📱</span>
                                    <span className="text-charcoal font-medium flex-1">
                                        {p.name}
                                    </span>
                                    <span className="text-charcoal/40 text-sm">disconnected</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-charcoal/40 text-xs mt-2">
                            Continue as this player with their score and cards
                        </p>
                    </div>
                )}

                {canJoinAsGuesser && (
                    <div className="mb-6">
                        {disconnectedPlayers.length > 0 && (
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-px bg-charcoal/10" />
                                <span className="text-charcoal/30 text-sm">or</span>
                                <div className="flex-1 h-px bg-charcoal/10" />
                            </div>
                        )}
                        <Button onClick={joinAsGuesser} variant="secondary">
                            Join as Guesser Only
                        </Button>
                        <p className="text-charcoal/40 text-xs mt-2 text-center">
                            Guess others&apos; rankings without your own spotlight turn
                        </p>
                    </div>
                )}

                {!canJoinAsGuesser && disconnectedPlayers.length === 0 && (
                    <p className="text-center text-charcoal/50 mb-6">
                        No options available right now. Try again later.
                    </p>
                )}

                <Button variant="ghost" onClick={leaveRoom}>
                    Leave Room
                </Button>
            </Card>
        </PageLayout>
    );
}
