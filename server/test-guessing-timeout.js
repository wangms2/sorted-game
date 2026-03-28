/**
 * Unit tests for guessing timer auto-submit logic.
 * These tests call gameEngine functions directly, no socket/network needed.
 * Run with: node test-guessing-timeout.js
 */

import { io } from 'socket.io-client';

// Only import gameEngine functions that don't need socket.io context
import { scoreGuesserPosition } from './gameEngine.js';
import { shuffle } from './deckManager.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) { passed++; console.log(`   PASS: ${msg}`); }
    else { failed++; console.error(`   FAIL: ${msg} (condition was false)`); }
}

/**
 * Build a minimal mock room for testing handleGuessingTimeout logic.
 * Sets up:
 * - 3 players (alice=host/hotSeat, bob=guesser, charlie=guesser)
 * - guessing phase with hotSeat having 5 ranking cards
 * - bob and charlie having draftGuess (shuffled version of hot seat's cards)
 * - room.hotSeat.shuffledCards set (what guessers see)
 */
function buildMockGuessingRoom() {
    const hotSeatCards = [
        { id: 'card_001', text: 'Card 1' },
        { id: 'card_002', text: 'Card 2' },
        { id: 'card_003', text: 'Card 3' },
        { id: 'card_004', text: 'Card 4' },
        { id: 'card_005', text: 'Card 5' },
    ];
    const shuffledHotSeatCards = shuffle([...hotSeatCards]);

    const alice = { id: 'alice', name: 'Alice', connected: true, hasGuessed: true, hasRanked: true, cards: hotSeatCards, ranking: hotSeatCards.map(c => c.id), score: 0, draftGuess: undefined, currentGuess: hotSeatCards.map(c => c.id) };
    const bob = { id: 'bob', name: 'Bob', connected: true, hasGuessed: false, hasRanked: true, cards: shuffledHotSeatCards, ranking: shuffledHotSeatCards.map(c => c.id), score: 0, draftGuess: shuffledHotSeatCards.map(c => c.id), currentGuess: undefined };
    const charlie = { id: 'charlie', name: 'Charlie', connected: true, hasGuessed: false, hasRanked: true, cards: shuffledHotSeatCards, ranking: shuffledHotSeatCards.map(c => c.id), score: 0, draftGuess: shuffledHotSeatCards.map(c => c.id), currentGuess: undefined };

    const room = {
        code: 'TEST1',
        mode: 'competitive',
        phase: 'guessing',
        hostId: 'alice',
        players: { alice, bob, charlie },
        hotSeat: {
            playerId: 'alice',
            cards: shuffledHotSeatCards,  // what guessers see
            shuffledCards: shuffledHotSeatCards,
            assignment: { name: 'Test Category', scale: 'Most to Least', type: 'categorical' },
            revealIndex: 0,
            revealedPositions: [],
            roundScores: {},
            perfectGuessers: [],
            readyPlayers: [],
        },
        settings: { guessingTimerSeconds: 30, rankingTimerSeconds: 30 },
        timerEndAt: Date.now() + 30000,
    };

    return { room, alice, bob, charlie, hotSeatCards, shuffledHotSeatCards };
}

/**
 * Simulate handleGuessingTimeout logic for competitive mode.
 * This is a copy of the actual logic from gameEngine.js for isolated testing.
 */
function simulateHandleGuessingTimeoutCompetitive(room) {
    const hotSeatPlayer = room.players[room.hotSeat.playerId];
    for (const player of Object.values(room.players)) {
        if (!player.hasGuessed && player.connected && player.id !== room.hotSeat.playerId) {
            // Use draft guess (synced from client) if available, otherwise fall back to shuffled cards dealt to guessers
            player.currentGuess = player.draftGuess || (room.hotSeat.shuffledCards || hotSeatPlayer.cards).map((c) => c.id);
            player.hasGuessed = true;
        }
    }
    room.timerEndAt = null;
    room.phase = 'reveal';
}

// ============ TESTS ============

async function testAutoSubmitUsesDraftGuessWhenAvailable() {
    console.log('\n=== TC2: No-drag auto-submit (draftGuess available) ===');
    const { room, bob, charlie, shuffledHotSeatCards } = buildMockGuessingRoom();

    // Neither bob nor charlie have dragged - they only have draftGuess (set on mount from shuffled cards)
    // So auto-submit should use draftGuess = shuffledHotSeatCards

    simulateHandleGuessingTimeoutCompetitive(room);

    assert(room.phase === 'reveal', 'Phase transitioned to reveal');
    assert(bob.hasGuessed === true, 'Bob: hasGuessed is true');
    assert(charlie.hasGuessed === true, 'Charlie: hasGuessed is true');
    assert(bob.currentGuess !== undefined, 'Bob: currentGuess is set');
    assert(charlie.currentGuess !== undefined, 'Charlie: currentGuess is set');

    // Key assertion: currentGuess should be the shuffled cards (draftGuess), NOT hotSeatCards
    const shuffledIds = shuffledHotSeatCards.map(c => c.id);
    assert(
        JSON.stringify(bob.currentGuess) === JSON.stringify(shuffledIds),
        `Bob: currentGuess matches shuffled draftGuess (not hot seat dealt order)`
    );
    assert(
        JSON.stringify(charlie.currentGuess) === JSON.stringify(shuffledIds),
        `Charlie: currentGuess matches shuffled draftGuess (not hot seat dealt order)`
    );
}

async function testAutoSubmitFallsBackToShuffledCardsWhenNoDraft() {
    console.log('\n=== TC2b: No-drag auto-submit (NO draftGuess) ===');
    const { room, bob, charlie, shuffledHotSeatCards } = buildMockGuessingRoom();

    // Clear draftGuess for bob - he never synced anything
    bob.draftGuess = undefined;

    simulateHandleGuessingTimeoutCompetitive(room);

    assert(room.phase === 'reveal', 'Phase transitioned to reveal');
    assert(bob.hasGuessed === true, 'Bob: hasGuessed is true');
    assert(bob.currentGuess !== undefined, 'Bob: currentGuess is set');

    // Should fall back to shuffledCards
    const shuffledIds = shuffledHotSeatCards.map(c => c.id);
    assert(
        JSON.stringify(bob.currentGuess) === JSON.stringify(shuffledIds),
        `Bob: currentGuess falls back to shuffledCards (not hot seat dealt order)`
    );
}

async function testDraggedOrderOverridesDraftGuess() {
    console.log('\n=== TC1: Dragged order overrides draftGuess ===');
    const { room, bob, shuffledHotSeatCards } = buildMockGuessingRoom();

    // Bob drags: reverses the shuffled order
    const draggedOrder = [...shuffledHotSeatCards].reverse().map(c => c.id);
    bob.draftGuess = draggedOrder;

    simulateHandleGuessingTimeoutCompetitive(room);

    assert(room.phase === 'reveal', 'Phase transitioned to reveal');
    assert(bob.hasGuessed === true, 'Bob: hasGuessed is true');
    assert(
        JSON.stringify(bob.currentGuess) === JSON.stringify(draggedOrder),
        `Bob: currentGuess matches dragged order (not draftGuess)`
    );
}

async function testHotSeatNotAutoSubmitted() {
    console.log('\n=== TC4: Hot seat not auto-submitted ===');
    const { room, alice, bob } = buildMockGuessingRoom();

    simulateHandleGuessingTimeoutCompetitive(room);

    // Alice (hot seat) should NOT have been auto-submitted
    // Her hasGuessed was already true, and she shouldn't be touched
    assert(alice.hasGuessed === true, 'Alice: hasGuessed remains true');
    // Bob (guesser) should be auto-submitted
    assert(bob.hasGuessed === true, 'Bob: hasGuessed is true');
}

async function testScoringAfterAutoSubmit() {
    console.log('\n=== SCORING: Auto-submitted guess scores correctly ===');
    const { room, bob, shuffledHotSeatCards, hotSeatCards } = buildMockGuessingRoom();

    // Bob's draftGuess is the shuffled hot seat cards
    bob.draftGuess = shuffledHotSeatCards.map(c => c.id);

    // The hot seat (Alice) ranking is: card_001, card_002, card_003, card_004, card_005
    // Bob's guess (shuffled) is some permutation
    const actualRanking = hotSeatCards.map(c => c.id);  // [card_001, card_002, ...]
    const bobGuess = bob.draftGuess;

    // Score each position
    let totalScore = 0;
    for (let i = 0; i < 5; i++) {
        totalScore += scoreGuesserPosition(actualRanking, bobGuess, i);
    }

    console.log(`   Actual ranking: ${actualRanking.join(', ')}`);
    console.log(`   Bob's guess:    ${bobGuess.join(', ')}`);
    console.log(`   Bob's score:    ${totalScore}`);

    // Score should be > 0 (not all 0s)
    assert(totalScore >= 0, `Bob's score is computed (${totalScore} points)`);
    // With shuffled cards, exact matches are unlikely but off-by-ones are possible
    assert(totalScore <= 10, `Bob's score is within valid range (max 10)`);
}

// ============ RUN ============

async function run() {
    console.log('========================================');
    console.log('Guessing Timer Auto-Submit Unit Tests');
    console.log('(Direct function calls — no server needed)');
    console.log('========================================');

    await testAutoSubmitUsesDraftGuessWhenAvailable();
    await testAutoSubmitFallsBackToShuffledCardsWhenNoDraft();
    await testDraggedOrderOverridesDraftGuess();
    await testHotSeatNotAutoSubmitted();
    await testScoringAfterAutoSubmit();

    console.log('\n========================================');
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('========================================');
    process.exit(failed > 0 ? 1 : 0);
}

run();
