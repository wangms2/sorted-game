import { useState, useEffect, useMemo } from 'react';
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

function deriveInsights(gameHistory, playerMap) {
    if (!gameHistory || gameHistory.length === 0) return { always: [], conditional: [] };

    const getName = (id) => playerMap[id]?.name || 'Unknown';

    // Build pairwise stats: pairPoints[guesserId][spotlightId] = [points, points, ...]
    const pairPoints = {};
    for (const entry of gameHistory) {
        for (const [guesserId, scores] of Object.entries(entry.guessScores)) {
            if (!pairPoints[guesserId]) pairPoints[guesserId] = {};
            if (!pairPoints[guesserId][entry.spotlightId]) pairPoints[guesserId][entry.spotlightId] = [];
            pairPoints[guesserId][entry.spotlightId].push(scores.points);
        }
    }

    // Per-spotlight avg: how well each spotlight was guessed
    const spotlightAvgs = {};
    for (const entry of gameHistory) {
        const scores = Object.values(entry.guessScores);
        if (scores.length === 0) continue;
        const avg = scores.reduce((s, g) => s + g.points, 0) / scores.length;
        if (!spotlightAvgs[entry.spotlightId]) spotlightAvgs[entry.spotlightId] = [];
        spotlightAvgs[entry.spotlightId].push(avg);
    }

    // Always-shown stats
    const always = [];

    // 1. Best Pair (mutual sum)
    const playerIds = [...new Set([
        ...Object.keys(pairPoints),
        ...Object.values(pairPoints).flatMap(p => Object.keys(p)),
    ])];
    let bestPair = null;
    let bestPairSum = -1;
    for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
            const a = playerIds[i], b = playerIds[j];
            const aToB = (pairPoints[a]?.[b] || []).reduce((s, v) => s + v, 0);
            const bToA = (pairPoints[b]?.[a] || []).reduce((s, v) => s + v, 0);
            const sum = aToB + bToA;
            if (sum > bestPairSum) { bestPairSum = sum; bestPair = [a, b]; }
        }
    }
    if (bestPair) {
        always.push({ emoji: '🤝', label: 'Best Pair', text: `${getName(bestPair[0])} & ${getName(bestPair[1])} (${bestPairSum} pts)` });
    }

    // 2. Most Predictable (highest avg received)
    let mostPredictable = null;
    let highestAvg = -1;
    for (const [id, avgs] of Object.entries(spotlightAvgs)) {
        const overall = avgs.reduce((s, v) => s + v, 0) / avgs.length;
        if (overall > highestAvg) { highestAvg = overall; mostPredictable = id; }
    }
    if (mostPredictable) {
        always.push({ emoji: '📖', label: 'Most Predictable', text: `${getName(mostPredictable)} (${highestAvg.toFixed(1)} avg)` });
    }

    // 3. Most Mysterious (lowest avg received)
    let mostMysterious = null;
    let lowestAvg = Infinity;
    for (const [id, avgs] of Object.entries(spotlightAvgs)) {
        const overall = avgs.reduce((s, v) => s + v, 0) / avgs.length;
        if (overall < lowestAvg) { lowestAvg = overall; mostMysterious = id; }
    }
    if (mostMysterious && mostMysterious !== mostPredictable) {
        always.push({ emoji: '🔮', label: 'Most Mysterious', text: `${getName(mostMysterious)} (${lowestAvg.toFixed(1)} avg)` });
    }

    // Conditional stats
    const conditional = [];

    // 1. Mind Meld — pair avg matching positions ≥4.0 across shared spotlights
    const pairAgreement = {};
    for (const entry of gameHistory) {
        const guesserIds = Object.keys(entry.guesses || {});
        for (let i = 0; i < guesserIds.length; i++) {
            for (let j = i + 1; j < guesserIds.length; j++) {
                const a = entry.guesses[guesserIds[i]];
                const b = entry.guesses[guesserIds[j]];
                if (!a || !b || a.length !== b.length) continue;
                const matches = a.reduce((count, v, k) => count + (v === b[k] ? 1 : 0), 0);
                const key = [guesserIds[i], guesserIds[j]].sort().join('|');
                if (!pairAgreement[key]) pairAgreement[key] = { ids: [guesserIds[i], guesserIds[j]], totals: [] };
                pairAgreement[key].totals.push(matches);
            }
        }
    }
    for (const { ids, totals } of Object.values(pairAgreement)) {
        const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
        if (avg >= 4.0) {
            const pct = Math.round((avg / 5) * 100);
            conditional.push({
                emoji: '🧠', label: 'Mind Meld',
                text: `${getName(ids[0])} and ${getName(ids[1])} think alike (${pct}% agreement)`,
            });
        }
    }

    // 2. One-Sided — A→B avg ≥8 but B→A avg ≤2
    for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
            const a = playerIds[i], b = playerIds[j];
            const aToBArr = pairPoints[a]?.[b] || [];
            const bToAArr = pairPoints[b]?.[a] || [];
            if (aToBArr.length === 0 || bToAArr.length === 0) continue;
            const aToBAvg = aToBArr.reduce((s, v) => s + v, 0) / aToBArr.length;
            const bToAAvg = bToAArr.reduce((s, v) => s + v, 0) / bToAArr.length;
            if (aToBAvg >= 8 && bToAAvg <= 2) {
                conditional.push({ emoji: '🫣', label: 'One-Sided', text: `${getName(a)} knows ${getName(b)} but not the other way around` });
            } else if (bToAAvg >= 8 && aToBAvg <= 2) {
                conditional.push({ emoji: '🫣', label: 'One-Sided', text: `${getName(b)} knows ${getName(a)} but not the other way around` });
            }
        }
    }

    // 3. Stumped Everyone — all guessers ≤3 on one spotlight
    for (const entry of gameHistory) {
        const scores = Object.values(entry.guessScores);
        if (scores.length >= 2 && scores.every(s => s.points <= 3)) {
            conditional.push({ emoji: '🤷', label: 'Stumped Everyone', text: `Nobody could figure out ${getName(entry.spotlightId)}'s ${entry.assignmentName}` });
        }
    }

    // 4. Total Whiff — a guesser scored 0/10 (aggregated per guesser)
    const whiffCounts = {};
    for (const entry of gameHistory) {
        for (const [guesserId, scores] of Object.entries(entry.guessScores)) {
            if (scores.points === 0) {
                if (!whiffCounts[guesserId]) whiffCounts[guesserId] = [];
                whiffCounts[guesserId].push(entry.spotlightId);
            }
        }
    }
    for (const [guesserId, spotlightIds] of Object.entries(whiffCounts)) {
        if (spotlightIds.length === 1) {
            conditional.push({ emoji: '💨', label: 'Total Whiff', text: `${getName(guesserId)} completely missed ${getName(spotlightIds[0])}` });
        } else {
            conditional.push({ emoji: '💨', label: 'Total Whiff', text: `${getName(guesserId)} completely missed ${spotlightIds.length} spotlights` });
        }
    }

    // 5. Open Book — all guessers ≥8 on one spotlight
    for (const entry of gameHistory) {
        const scores = Object.values(entry.guessScores);
        if (scores.length >= 2 && scores.every(s => s.points >= 8)) {
            conditional.push({ emoji: '📖', label: 'Open Book', text: `Everyone could read ${getName(entry.spotlightId)}'s ${entry.assignmentName}` });
        }
    }

    return { always, conditional };
}

export default function EndScreen() {
    const { room, players, playAgain, leaveRoom } = useGameState();

    if (!room) return null;

    const isCoop = room.mode === 'coop';
    const leaderboard = [...players].sort((a, b) => b.score - a.score);
    const winner = leaderboard[0];
    const isTie = leaderboard.length > 1 && leaderboard[0].score === leaderboard[1].score;

    // Coop: calculate connection percentage
    // Each player guesses the other's 5 cards: max 5×2 = 10 points per turn
    // Two turns per round (each guesses the other) = 20 max per round
    const maxPerRound = 20;
    const totalRounds = room.totalRounds || 1;
    const maxScore = maxPerRound * totalRounds;
    const combinedScore = players.reduce((sum, p) => sum + p.score, 0);
    const connectionPct = Math.min(100, Math.round((combinedScore / maxScore) * 100));

    function getConnectionLabel(pct) {
        if (pct >= 90) return { emoji: '💕', label: 'Soulmates' };
        if (pct >= 70) return { emoji: '🤝', label: 'Best Friends' };
        if (pct >= 50) return { emoji: '😊', label: 'Getting There' };
        if (pct >= 25) return { emoji: '🌱', label: 'Room to Grow' };
        return { emoji: '🔮', label: 'Full of Surprises' };
    }

    const connection = getConnectionLabel(connectionPct);
    const coopStats = room.coopStats || { exact: 0, offByOne: 0, missed: 0 };
    const totalCards = coopStats.exact + coopStats.offByOne + coopStats.missed;

    const insights = useMemo(() => {
        if (isCoop) return { always: [], conditional: [] };
        return deriveInsights(room.gameHistory, room.players);
    }, [isCoop, room.gameHistory, room.players]);
    const hasInsights = insights.always.length > 0 || insights.conditional.length > 0;

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
                            {totalCards > 0 && (
                                <div className="flex justify-center gap-6 mb-4">
                                    <div className="text-center">
                                        <span className="text-amber font-bold text-2xl">
                                            <CountUpNumber value={coopStats.exact} />
                                        </span>
                                        <p className="text-charcoal/40 text-xs font-medium">Exact (+2)</p>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-amber/60 font-bold text-2xl">
                                            <CountUpNumber value={coopStats.offByOne} />
                                        </span>
                                        <p className="text-charcoal/40 text-xs font-medium">Off by 1 (+1)</p>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-charcoal/30 font-bold text-2xl">
                                            <CountUpNumber value={coopStats.missed} />
                                        </span>
                                        <p className="text-charcoal/40 text-xs font-medium">Missed (+0)</p>
                                    </div>
                                </div>
                            )}
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
                                                {player.guesserOnly && (
                                                    <span className="ml-2 text-xs text-charcoal/40 font-normal">guesser</span>
                                                )}
                                            </span>
                                            <span className={`font-bold ${isWinner ? 'text-amber text-xl' : 'text-charcoal text-lg'}`}>
                                                <CountUpNumber value={player.score} />
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        {hasInsights && (
                            <Card className="mb-6">
                                <h3 className="text-charcoal/40 text-sm uppercase tracking-wide mb-3 text-center font-medium">
                                    Game Insights
                                </h3>
                                <div className="space-y-2.5">
                                    {insights.always.map((stat, i) => (
                                        <div key={`a-${i}`} className="flex items-start gap-2 px-1">
                                            <span className="text-base flex-shrink-0">{stat.emoji}</span>
                                            <p className="text-charcoal text-sm">
                                                <span className="font-bold">{stat.label}</span>{' '}
                                                <span className="text-charcoal/70">{stat.text}</span>
                                            </p>
                                        </div>
                                    ))}
                                    {(() => {
                                        const grouped = [];
                                        for (const stat of insights.conditional) {
                                            const existing = grouped.find(g => g.label === stat.label);
                                            if (existing) { existing.items.push(stat); }
                                            else { grouped.push({ label: stat.label, emoji: stat.emoji, items: [stat] }); }
                                        }
                                        return grouped.map((group, gi) => (
                                            <div key={`cg-${gi}`} className="flex items-start gap-2 px-1">
                                                <span className="text-base flex-shrink-0">{group.emoji}</span>
                                                <div className="text-charcoal text-sm">
                                                    {group.items.length === 1 ? (
                                                        <p>
                                                            <span className="font-bold">{group.label}</span>{' '}
                                                            <span className="text-charcoal/70">{group.items[0].text}</span>
                                                        </p>
                                                    ) : (
                                                        <>
                                                            <p className="font-bold mb-1">{group.label}</p>
                                                            <ul className="list-disc list-inside space-y-0.5">
                                                                {group.items.map((item, ii) => (
                                                                    <li key={ii} className="text-charcoal/70">{item.text}</li>
                                                                ))}
                                                            </ul>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </Card>
                        )}
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
