import { useState, useEffect } from 'react';
import useGameState from '../../hooks/useGameState.js';
import PageLayout from '../ui/PageLayout.jsx';
import Button from '../ui/Button.jsx';

function CountUpNumber({ value, prefix = '' }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (value === 0) { setDisplay(0); return; }
        let start = 0;
        const step = Math.max(1, Math.ceil(value / 15));
        const interval = setInterval(() => {
            start = Math.min(start + step, value);
            setDisplay(start);
            if (start >= value) clearInterval(interval);
        }, 30);
        return () => clearInterval(interval);
    }, [value]);
    return <span className="animate-count-pop inline-block">{prefix}{display}</span>;
}

export default function RevealScreen() {
    const { room, isHotSeat, revealNext, advanceRound, players, myPlayer } = useGameState();
    const hotSeat = room?.hotSeat;
    const [prevRevealIndex, setPrevRevealIndex] = useState(0);
    const [scoringOpen, setScoringOpen] = useState(false);

    if (!room || !hotSeat) return null;

    const isCoop = room.mode === 'coop';
    const coopPhase = hotSeat.coopPhase;
    const isSecondReveal = coopPhase === 'reveal_second';

    // In coop, the spotlight (revealer) is the target player
    const targetPlayerId = hotSeat.targetPlayerId || hotSeat.playerId;
    const targetPlayer = room.players[targetPlayerId];
    const targetName = targetPlayer?.name || 'Unknown';
    const assignment = hotSeat.assignment;

    // Determine who controls the reveal
    const myId = myPlayer?.id;
    const canReveal = isCoop
        ? myId === targetPlayerId  // in coop, the person being revealed controls it
        : isHotSeat;

    const revealedRanking = hotSeat.revealedRanking || {};
    const revealedPositions = new Set(hotSeat.revealedPositions || []);
    const revealIndex = hotSeat.revealIndex;
    const allRevealed = revealIndex >= 5;
    const myGuess = hotSeat.myGuess || null;
    const guesserId = hotSeat.guesserId || null;
    const perfectGuessers = new Set(hotSeat.perfectGuessers || []);
    const readyPlayers = new Set(hotSeat.readyPlayers || []);
    const iAmReady = myId ? readyPlayers.has(myId) : false;

    // Track when a new card is revealed for flip animation
    const justRevealed = revealIndex > prevRevealIndex;
    if (justRevealed && revealIndex !== prevRevealIndex) {
        setTimeout(() => setPrevRevealIndex(revealIndex), 0);
    }

    // Build a card lookup from shuffled cards
    const cardMap = {};
    if (hotSeat.cards) {
        for (const card of hotSeat.cards) {
            cardMap[card.id] = card;
        }
    }

    // In coop, myGuess is actually the guesser's guess (could be either player)
    const guesserName = isCoop && guesserId ? (room.players[guesserId]?.name || 'Guesser') : null;
    // Show guess column if we have a guess (competitive: always if non-hotseat; coop: both see it)
    const showGuessColumn = !!myGuess;

    // The last revealed position (for flip animation)
    const lastRevealedPos = (hotSeat.revealedPositions || []).at(-1);

    // Build the 5 slots
    const slots = [];
    for (let i = 0; i < 5; i++) {
        const isRevealed = revealedPositions.has(i);
        if (isRevealed) {
            const cardId = revealedRanking[i];
            let myGuessedPos = null;
            let pointsEarned = null;
            if (myGuess && myGuess.length > 0) {
                const guessIdx = myGuess.indexOf(cardId);
                if (guessIdx !== -1) {
                    myGuessedPos = guessIdx + 1;
                    const diff = Math.abs(myGuessedPos - (i + 1));
                    pointsEarned = diff === 0 ? 2 : diff === 1 ? 1 : 0;
                }
            }
            slots.push({
                position: i + 1,
                index: i,
                revealed: true,
                card: cardMap[cardId] || { id: cardId, text: cardId },
                isNew: i === lastRevealedPos && justRevealed,
                myGuessedPos,
                pointsEarned,
            });
        } else {
            slots.push({ position: i + 1, index: i, revealed: false, card: null, isNew: false, myGuessedPos: null, pointsEarned: null });
        }
    }

    // Score entries — all players, ordered by playerOrder (spotlight order)
    const roundScores = hotSeat.roundScores || {};
    const scoreEntries = (room.playerOrder || [])
        .map((id) => {
            const p = room.players[id];
            if (!p) return null;
            return {
                id,
                name: p.name,
                roundPoints: roundScores[id] ?? 0,
                totalScore: p.score,
                isHotSeat: id === hotSeat.playerId,
                isPerfect: perfectGuessers.has(id),
            };
        })
        .filter(Boolean);

    // What's next — find next eligible spotlight (skip guesserOnly/disconnected)
    const hotSeatIndex = room.hotSeatIndex;
    let nextHotSeatId = null;
    for (let i = hotSeatIndex + 1; i < room.playerOrder.length; i++) {
        const pid = room.playerOrder[i];
        const p = room.players[pid];
        if (p && p.connected && !p.guesserOnly) {
            nextHotSeatId = pid;
            break;
        }
    }
    const moreHotSeats = nextHotSeatId !== null;
    const nextHotSeatName = nextHotSeatId ? room.players[nextHotSeatId]?.name : null;
    const currentRound = room.currentRoundNumber;
    const totalRounds = room.totalRounds;
    const isLastSpotlightLastRound = isCoop
        ? (isSecondReveal && currentRound >= totalRounds)
        : (!moreHotSeats && currentRound >= totalRounds);

    // In coop first reveal, next is the second reveal
    const secondPlayerName = isCoop && hotSeat.coopSecondId
        ? room.players[hotSeat.coopSecondId]?.name
        : null;

    function getNextButtonText() {
        if (isCoop) {
            if (!isSecondReveal) {
                return `Next: ${secondPlayerName || 'Partner'}'s Reveal`;
            }
            if (currentRound >= totalRounds) return 'See Final Results';
            return `Next Round (${currentRound + 1}/${totalRounds})`;
        }
        if (isLastSpotlightLastRound) return 'See Final Results';
        if (nextHotSeatName) return `Next Spotlight: ${nextHotSeatName}`;
        if (moreHotSeats) return 'Next Spotlight';
        return `Next Round (${currentRound + 1}/${totalRounds})`;
    }

    const connectedCount = players.filter(p => p.connected).length;
    const readyCount = readyPlayers.size;

    return (
        <PageLayout>
            <div className="w-full max-w-lg animate-fade-in">
                {/* Header */}
                <div className="text-center mb-5">
                    <p className="text-charcoal text-sm uppercase tracking-wide mb-1 font-medium">
                        {targetName}&apos;s Ranking
                        {isCoop && <span className="ml-2 text-amber">({isSecondReveal ? '2/2' : '1/2'})</span>}
                    </p>
                    <h2 className="font-display text-2xl font-bold text-charcoal mb-1">{assignment?.name}</h2>
                    <p className="text-charcoal text-sm">{assignment?.scale}</p>
                    <button
                        onClick={() => setScoringOpen(!scoringOpen)}
                        className="text-charcoal/30 text-xs mt-2 cursor-pointer hover:text-charcoal/50 transition font-medium"
                    >
                        {scoringOpen ? 'Hide scoring' : 'How scoring works'}
                    </button>
                    {scoringOpen && (
                        <div className="mt-2 text-charcoal/50 text-xs leading-relaxed bg-surface rounded-xl px-4 py-3 text-left">
                            <p><span className="font-semibold text-amber">+2</span> card in the exact position</p>
                            <p><span className="font-semibold text-amber">+1</span> off by one position</p>
                            <p><span className="font-semibold text-charcoal/60">+0</span> off by two or more</p>
                            {!isCoop && (
                                <p className="mt-1">Spotlight: <span className="font-semibold text-amber">+1</span> for each guesser who places a card exactly right</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Compact scoreboard bar */}
                <div className="bg-surface rounded-2xl px-3 py-2 mb-4 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap">
                    {scoreEntries.map((entry) => (
                        <div key={entry.id} className={`flex items-center gap-1 ${entry.id === myId ? 'bg-amber/10 rounded-lg px-1.5 -mx-0.5' : ''}`}>
                            <span className={`text-xs font-medium truncate max-w-[3.5rem] ${entry.id === myId ? 'text-amber' : 'text-charcoal'}`}>
                                {entry.name}
                            </span>
                            {entry.isHotSeat && <span className="text-amber text-[10px]">&#x2605;</span>}
                            {allRevealed && entry.isPerfect && (
                                <span className="text-amber text-[10px]" title="Perfect 5/5!">&#x1F3AF;</span>
                            )}
                            <span className={`font-bold text-xs ${entry.roundPoints > 0 ? 'text-amber' : 'text-charcoal/30'}`}>
                                <CountUpNumber value={entry.roundPoints} prefix="+" />
                            </span>
                        </div>
                    ))}
                </div>

                {/* Scale label + column legend */}
                <div className="flex items-center gap-3 px-4 mb-2 text-xs text-charcoal/40 font-medium">
                    {showGuessColumn ? <span className="w-8 text-center">{guesserName || 'You'}</span> : <span className="w-8" />}
                    <span className="w-8 text-center">&#x2B06;</span>
                    <span>Most</span>
                </div>

                {/* Card slots */}
                <div className="space-y-2 mb-2">
                    {slots.map((slot) => {
                        let borderColor = 'border-charcoal';
                        let bgAccent = '';
                        if (slot.revealed && slot.pointsEarned !== null) {
                            if (slot.pointsEarned === 2) {
                                borderColor = 'border-amber';
                                bgAccent = 'bg-amber/5';
                            } else if (slot.pointsEarned === 1) {
                                borderColor = 'border-amber/40';
                                bgAccent = 'bg-amber/[0.02]';
                            }
                        }
                        return (
                            <div
                                key={slot.position}
                                onClick={() => canReveal && !slot.revealed && !allRevealed && revealNext(slot.index)}
                                className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300
                                    ${slot.revealed
                                        ? `bg-card ${bgAccent} border-4 ${borderColor} shadow-card ${slot.isNew ? 'animate-card-flip' : ''}`
                                        : `bg-surface border-4 border-surface ${canReveal && !allRevealed ? 'cursor-pointer hover:border-amber/30 hover:bg-surface/80 active:scale-[0.98]' : ''}`}`}
                            >
                                {slot.revealed && slot.myGuessedPos !== null ? (
                                    <span title="Your guessed position" className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg font-bold text-xs
                                        ${slot.pointsEarned === 2 ? 'bg-amber/20 text-amber' : slot.pointsEarned === 1 ? 'bg-amber/10 text-amber/60' : 'bg-charcoal/5 text-charcoal/30'}`}>
                                        {slot.myGuessedPos}
                                    </span>
                                ) : (
                                    <span className="flex-shrink-0 w-8 h-8" />
                                )}

                                <span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm
                                    ${slot.revealed ? 'bg-amber text-white' : 'bg-charcoal/10 text-charcoal/30'}`}>
                                    {slot.position}
                                </span>
                                {slot.revealed ? (
                                    <span className="text-charcoal font-medium text-lg flex-1">
                                        {slot.card?.text}
                                    </span>
                                ) : (
                                    <span className="text-charcoal/20 italic text-lg flex-1">???</span>
                                )}

                                {slot.revealed && slot.pointsEarned !== null && (
                                    <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-lg
                                        ${slot.pointsEarned === 2 ? 'bg-amber text-white' : slot.pointsEarned === 1 ? 'bg-amber/30 text-amber' : 'bg-charcoal/10 text-charcoal/30'}`}>
                                        +{slot.pointsEarned}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Scale label bottom */}
                <div className="flex items-center gap-3 px-4 mb-4 text-xs text-charcoal/40 font-medium">
                    <span className="w-8" />
                    <span className="w-8 text-center">&#x2B07;</span>
                    <span>Least</span>
                </div>

                {/* Instruction (during reveals) */}
                {!allRevealed && (
                    <div className="text-center mb-4">
                        <p className="text-charcoal/50 font-medium">
                            {canReveal
                                ? 'Tap a card to reveal it'
                                : `Waiting for ${targetName} to reveal...`}
                        </p>
                    </div>
                )}

                {/* Post-reveal: total scores + perfect guess */}
                {allRevealed && (
                    <div className="space-y-3 mb-2">
                        {isCoop ? (
                            <>
                                {/* Coop: show 2pt/1pt/0pt breakdown */}
                                {(() => {
                                    const counts = { 2: 0, 1: 0, 0: 0 };
                                    for (const slot of slots) {
                                        if (slot.revealed && slot.pointsEarned !== null) {
                                            counts[slot.pointsEarned]++;
                                        }
                                    }
                                    const roundPts = Object.values(hotSeat.roundScores || {}).reduce((a, b) => a + b, 0);
                                    return (
                                        <div className="bg-surface rounded-2xl px-4 py-3">
                                            <div className="flex justify-center gap-4 mb-2">
                                                <div className="text-center">
                                                    <span className="text-amber font-bold text-lg">{counts[2]}</span>
                                                    <p className="text-charcoal/40 text-[10px] font-medium">Exact</p>
                                                </div>
                                                <div className="text-center">
                                                    <span className="text-amber/60 font-bold text-lg">{counts[1]}</span>
                                                    <p className="text-charcoal/40 text-[10px] font-medium">Off by 1</p>
                                                </div>
                                                <div className="text-center">
                                                    <span className="text-charcoal/30 font-bold text-lg">{counts[0]}</span>
                                                    <p className="text-charcoal/40 text-[10px] font-medium">Missed</p>
                                                </div>
                                            </div>
                                            <div className="text-center text-charcoal/50 text-xs font-medium">
                                                Connection Score: <span className="text-amber font-bold">
                                                    <CountUpNumber value={players.reduce((sum, p) => sum + p.score, 0)} />
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </>
                        ) : (
                            <div className="bg-surface rounded-2xl px-3 py-2.5">
                                <h3 className="text-charcoal/40 text-[10px] uppercase tracking-wide mb-1.5 text-center font-medium">
                                    Leaderboard
                                </h3>
                                <div className="flex items-center justify-center gap-x-3 gap-y-1 flex-wrap">
                                    {[...scoreEntries].sort((a, b) => b.totalScore - a.totalScore).map((entry) => (
                                        <div key={entry.id} className="flex items-center gap-1">
                                            <span className="text-charcoal text-xs font-medium truncate max-w-[3.5rem]">
                                                {entry.name}
                                            </span>
                                            <span className="text-charcoal font-bold text-xs">
                                                <CountUpNumber value={entry.totalScore} />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {perfectGuessers.size > 0 && (
                            <div className="bg-amber/10 border-2 border-amber/30 rounded-2xl p-3 text-center">
                                <p className="text-amber font-bold text-sm mb-1">&#x1F3AF; Perfect Guess!</p>
                                {[...perfectGuessers].map(id => (
                                    <p key={id} className="text-charcoal text-sm font-medium">
                                        {room.players[id]?.name} got all 5 right!
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Next button — shown when all revealed */}
                {allRevealed && (
                    <div className="mt-5">
                        {iAmReady ? (
                            <div className="text-center">
                                <p className="text-charcoal/40 text-sm font-medium">
                                    Waiting for others... ({readyCount}/{connectedCount})
                                </p>
                            </div>
                        ) : (
                            <Button onClick={advanceRound}>
                                {getNextButtonText()}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </PageLayout>
    );
}
