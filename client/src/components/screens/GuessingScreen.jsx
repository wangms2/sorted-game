import { useState, useCallback, useEffect, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensors, useSensor } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useGameState from '../../hooks/useGameState.js';
import Timer from '../ui/Timer.jsx';
import PageLayout from '../ui/PageLayout.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

function SortableCard({ id, text, rank }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const baseTransform = CSS.Transform.toString(transform);
    const style = {
        transform: baseTransform,
        transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease, opacity 150ms ease',
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.95 : 1,
        boxShadow: isDragging
            ? '0 12px 28px rgba(0,0,0,0.12)'
            : '0 2px 8px rgba(0,0,0,0.08)',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`flex items-center gap-3 bg-card border-4 border-charcoal rounded-xl px-4 py-2.5 cursor-grab active:cursor-grabbing select-none touch-none
                ${isDragging ? 'border-amber' : ''}`}
        >
            <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-amber text-white font-bold text-sm">
                {rank}
            </span>
            <span className="text-charcoal font-medium text-base">{text}</span>
            <span className="ml-auto text-charcoal/30">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <circle cx="7" cy="5" r="1.5" />
                    <circle cx="13" cy="5" r="1.5" />
                    <circle cx="7" cy="10" r="1.5" />
                    <circle cx="13" cy="10" r="1.5" />
                    <circle cx="7" cy="15" r="1.5" />
                    <circle cx="13" cy="15" r="1.5" />
                </svg>
            </span>
        </div>
    );
}

export default function GuessingScreen() {
    const { room, myPlayer, submitGuess, syncGuess, players } = useGameState();
    const hotSeat = room?.hotSeat;
    const [pulsing, setPulsing] = useState(false);

    const [items, setItems] = useState(() => hotSeat?.cards?.map((c) => c.id) || []);
    const itemsRef = useRef(items);
    itemsRef.current = items;

    // Sync initial card order to server as draft guess
    useEffect(() => {
        if (items.length > 0 && room?.phase === 'guessing' && !myPlayer?.hasGuessed) {
            syncGuess(items);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-submit current order if phase transitions away before lock-in
    const hasGuessedRef = useRef(myPlayer?.hasGuessed);
    hasGuessedRef.current = myPlayer?.hasGuessed;
    useEffect(() => {
        if (room?.phase !== 'guessing' && !hasGuessedRef.current) {
            submitGuess(itemsRef.current);
        }
    }, [room?.phase, submitGuess]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const cardMap = {};
    if (hotSeat?.cards) {
        for (const card of hotSeat.cards) {
            cardMap[card.id] = card;
        }
    }

    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setItems((prev) => {
                const oldIndex = prev.indexOf(active.id);
                const newIndex = prev.indexOf(over.id);
                const newItems = arrayMove(prev, oldIndex, newIndex);
                syncGuess(newItems);
                return newItems;
            });
        }
    }, [syncGuess]);

    const handleLockIn = useCallback(() => {
        setPulsing(true);
        setTimeout(() => submitGuess(items), 200);
    }, [items, submitGuess]);

    if (!room || !myPlayer || !hotSeat) return null;

    const hasGuessed = myPlayer.hasGuessed;
    const isCoop = room.mode === 'coop';
    const targetPlayerId = hotSeat.targetPlayerId || hotSeat.playerId;
    const targetPlayer = room.players[targetPlayerId];
    const targetName = targetPlayer?.name || 'Unknown';
    const assignment = hotSeat.assignment;

    // After locking in, show waiting state
    if (hasGuessed) {
        const unguessed = players.filter(
            (p) => !p.hasGuessed && p.connected && (isCoop || p.id !== hotSeat.playerId)
        );
        return (
            <PageLayout>
                <Card className="w-full max-w-md text-center animate-fade-in">
                    <div className="text-4xl mb-3">&#x1F512;</div>
                    <h2 className="font-display text-2xl font-bold text-charcoal mb-2">Guess Locked In!</h2>
                    <p className="text-charcoal/50 mb-6">Waiting for others to finish guessing...</p>

                    <div className="mb-6">
                        <Timer timerEndAt={room.timerEndAt} totalSeconds={room.settings?.guessingTimerSeconds} />
                    </div>

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
                </Card>
            </PageLayout>
        );
    }

    // Guessing UI
    return (
        <PageLayout className="items-start">
            <div className="w-full max-w-md animate-fade-in">
                {/* Header */}
                <div className="text-center mb-4">
                    <div className="mb-3">
                        <Timer timerEndAt={room.timerEndAt} totalSeconds={room.settings?.guessingTimerSeconds} />
                    </div>
                    <p className="text-charcoal text-sm uppercase tracking-wide mb-1 font-medium">
                        Guess <span className="text-charcoal font-display font-bold text-lg normal-case">{targetName}</span>&apos;s ranking
                    </p>
                    <h2 className="font-display text-2xl font-bold text-charcoal mb-1">{assignment?.name}</h2>
                    <p className="text-charcoal text-sm">{assignment?.scale}</p>
                </div>

                {/* Scale labels */}
                <div className="flex justify-between text-xs text-charcoal/40 px-2 mb-2 font-medium">
                    <span>&#x2B06; Most</span>
                    <span>Drag to reorder</span>
                </div>

                {/* Sortable list */}
                <div className="bg-surface rounded-2xl p-3 mb-3">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={items} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                                {items.map((id, index) => (
                                    <SortableCard
                                        key={id}
                                        id={id}
                                        text={cardMap[id]?.text || id}
                                        rank={index + 1}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                <div className="flex justify-between text-xs text-charcoal/40 px-2 mb-2 font-medium">
                    <span>&#x2B07; Least</span>
                    <span></span>
                </div>

                {/* Lock In button */}
                <div className="sticky bottom-0 bg-cream pt-2 pb-4">
                    <Button
                        onClick={handleLockIn}
                        className={pulsing ? 'animate-pulse-amber' : ''}
                    >
                        Lock In Guess
                    </Button>
                </div>
            </div>
        </PageLayout>
    );
}
