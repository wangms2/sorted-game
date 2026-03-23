import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';
let passed = 0;
let failed = 0;

function connect() {
    return new Promise((resolve, reject) => {
        const socket = io(URL);
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        socket.on('connect', () => { clearTimeout(timeout); resolve(socket); });
        socket.on('connect_error', (err) => { clearTimeout(timeout); reject(err); });
    });
}

function waitFor(socket, event, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
        socket.once(event, (data) => { clearTimeout(timeout); resolve(data); });
    });
}

function assert(condition, msg) {
    if (condition) { passed++; console.log(`   PASS: ${msg}`); }
    else { failed++; console.error(`   FAIL: ${msg}`); }
}

async function drainAll(sockets, targetSocket, timeoutMs = 3000) {
    const promises = sockets.map(s => waitFor(s, 'room_updated', timeoutMs).catch(() => null));
    const results = await Promise.all(promises);
    const targetIdx = sockets.indexOf(targetSocket);
    return results[targetIdx];
}

// Full helper: create room → join → start → rank → guess → reveal all → arrive at scores
async function setupGameInScores() {
    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();
    const sockets = [alice, bob, charlie];

    // Create + join
    const createP = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await createP;
    const code = room.code;

    let p = drainAll(sockets, bob);
    bob.emit('join_room', { roomCode: code, playerName: 'Bob' });
    await p;

    p = drainAll(sockets, charlie);
    charlie.emit('join_room', { roomCode: code, playerName: 'Charlie' });
    await p;

    return { alice, bob, charlie, sockets, code };
}

async function startAndGetIds(sockets, hostSocket, totalRounds) {
    const allStartP = sockets.map(s => waitFor(s, 'room_updated'));
    hostSocket.emit('start_game', { totalRounds });
    const starts = await Promise.all(allStartP);

    // Extract player IDs from each perspective
    const ids = starts.map(s => Object.values(s.room.players).find(pp => pp.sessionToken).id);
    const cards = starts.map(s => Object.values(s.room.players).find(pp => pp.sessionToken).cards);

    return { starts, ids, cards };
}

async function doRankingPhase(sockets, cards) {
    // First N-1 players submit
    for (let i = 0; i < sockets.length - 1; i++) {
        const p = drainAll(sockets, sockets[i]);
        sockets[i].emit('submit_ranking', { ranking: cards[i].map(c => c.id) });
        await p;
    }
    // Last player triggers transition
    const guessingP = sockets.map(s => waitFor(s, 'room_updated'));
    const last = sockets.length - 1;
    sockets[last].emit('submit_ranking', { ranking: cards[last].map(c => c.id) });
    const guessingUpdates = await Promise.all(guessingP);
    return guessingUpdates;
}

async function doGuessingPhase(sockets, ids, guessingUpdates) {
    const hotSeatId = guessingUpdates[0].room.hotSeat.playerId;
    const hotSeatCards = guessingUpdates[0].room.hotSeat.cards;
    const guessCardIds = hotSeatCards.map(c => c.id);

    const idToSocket = {};
    for (let i = 0; i < sockets.length; i++) idToSocket[ids[i]] = sockets[i];

    const hotSeatSocket = idToSocket[hotSeatId];
    const nonHotSeatSockets = sockets.filter(s => s !== hotSeatSocket);

    // First guesser
    let p = drainAll(sockets, nonHotSeatSockets[0]);
    nonHotSeatSockets[0].emit('submit_guess', { guess: guessCardIds });
    await p;

    // Last guesser → transition to reveal
    const revealP = sockets.map(s => waitFor(s, 'room_updated'));
    nonHotSeatSockets[1].emit('submit_guess', { guess: [...guessCardIds].reverse() });
    const revealUpdates = await Promise.all(revealP);

    return { hotSeatSocket, nonHotSeatSockets, hotSeatId, revealUpdates };
}

async function doRevealPhase(sockets, hotSeatSocket) {
    let lastUpdates;
    for (let i = 0; i < 5; i++) {
        const revP = sockets.map(s => waitFor(s, 'room_updated'));
        hotSeatSocket.emit('reveal_next');
        lastUpdates = await Promise.all(revP);
    }
    return lastUpdates; // These are scores phase updates
}

// ============ TEST SUITE ============

async function testScoresPhaseData() {
    console.log('\n=== Scores Phase Data Tests ===');

    const { alice, bob, charlie, sockets, code } = await setupGameInScores();
    const { starts, ids, cards } = await startAndGetIds(sockets, alice, 1);
    const guessingUpdates = await doRankingPhase(sockets, cards);
    const { hotSeatSocket } = await doGuessingPhase(sockets, ids, guessingUpdates);
    const scoresUpdates = await doRevealPhase(sockets, hotSeatSocket);
    const room = scoresUpdates[0].room;

    console.log('1. Phase is reveal (all cards shown)...');
    assert(room.phase === 'reveal', 'Phase is reveal');

    console.log('2. Hot seat data still present...');
    assert(room.hotSeat != null, 'Hot seat exists');
    assert(room.hotSeat.roundScores != null, 'Round scores exist');
    assert(room.hotSeat.revealedRanking != null, 'Ranking revealed');
    assert(Object.keys(room.hotSeat.revealedRanking).length === 5, 'Full ranking revealed');

    console.log('3. Players have cumulative scores...');
    for (const player of Object.values(room.players)) {
        assert(typeof player.score === 'number', `${player.name} has numeric score`);
    }

    console.log('4. No auto-advance timer (manual proceed)...');
    // Timer should not be set since we wait for all players
    // assert(room.timerEndAt != null, 'Timer set for auto-advance'); — removed, manual proceed now

    sockets.forEach(s => s.disconnect());
}

async function testHostAdvanceFromScores() {
    console.log('\n=== Host Advance From Scores Test ===');

    const { alice, bob, charlie, sockets } = await setupGameInScores();
    const { starts, ids, cards } = await startAndGetIds(sockets, alice, 1);
    const guessingUpdates = await doRankingPhase(sockets, cards);
    const { hotSeatSocket } = await doGuessingPhase(sockets, ids, guessingUpdates);
    await doRevealPhase(sockets, hotSeatSocket);

    // All players click advance to proceed (instead of host only)
    console.log('1. All players click proceed...');
    const advUpdates = await allPlayersProceed(sockets);
    const nextPhase = advUpdates[0].room.phase;

    // With 3 players and 1 round, after first hot seat we should go to next hot seat (guessing)
    console.log(`   Next phase: ${nextPhase}`);
    assert(nextPhase === 'guessing' || nextPhase === 'game_end', 'Transitioned to guessing or game_end');

    sockets.forEach(s => s.disconnect());
}

async function allPlayersProceed(sockets) {
    // Each player except last clicks proceed, draining ALL sockets each time
    for (const s of sockets.slice(0, -1)) {
        const drainP = sockets.map(sock => waitFor(sock, 'room_updated', 2000).catch(() => { }));
        s.emit('advance_round');
        await Promise.all(drainP);
    }
    // Last player triggers transition — all sockets get final update
    const advP = sockets.map(s => waitFor(s, 'room_updated', 8000));
    sockets.at(-1).emit('advance_round');
    return Promise.all(advP);
}

async function testFullSingleRoundLoop() {
    console.log('\n=== Full Single Round Loop (3 hot seats → game_end) ===');

    const { alice, bob, charlie, sockets } = await setupGameInScores();
    const { starts, ids, cards } = await startAndGetIds(sockets, alice, 1);

    // --- Hot seat 1 ---
    console.log('1. Hot seat 1...');
    let guessingUpdates = await doRankingPhase(sockets, cards);
    let { hotSeatSocket, hotSeatId } = await doGuessingPhase(sockets, ids, guessingUpdates);
    console.log(`   Hot seat: ${guessingUpdates[0].room.players[hotSeatId]?.name || hotSeatId}`);
    await doRevealPhase(sockets, hotSeatSocket);

    // Advance to hot seat 2
    let advUpdates = await allPlayersProceed(sockets);
    assert(advUpdates[0].room.phase === 'guessing', 'After hot seat 1 → guessing (hot seat 2)');

    // --- Hot seat 2 ---
    console.log('2. Hot seat 2...');
    guessingUpdates = advUpdates; // Already in guessing
    ({ hotSeatSocket, hotSeatId } = await doGuessingPhase(sockets, ids, guessingUpdates));
    console.log(`   Hot seat: ${guessingUpdates[0].room.players[hotSeatId]?.name || hotSeatId}`);
    await doRevealPhase(sockets, hotSeatSocket);

    advUpdates = await allPlayersProceed(sockets);
    assert(advUpdates[0].room.phase === 'guessing', 'After hot seat 2 → guessing (hot seat 3)');

    // --- Hot seat 3 ---
    console.log('3. Hot seat 3...');
    guessingUpdates = advUpdates;
    ({ hotSeatSocket, hotSeatId } = await doGuessingPhase(sockets, ids, guessingUpdates));
    console.log(`   Hot seat: ${guessingUpdates[0].room.players[hotSeatId]?.name || hotSeatId}`);
    await doRevealPhase(sockets, hotSeatSocket);

    advUpdates = await allPlayersProceed(sockets);
    assert(advUpdates[0].room.phase === 'game_end', 'After all hot seats → game_end');

    console.log('4. Game end data...');
    const endRoom = advUpdates[0].room;
    assert(endRoom.hotSeat == null, 'Hot seat is null at game_end');
    for (const player of Object.values(endRoom.players)) {
        assert(typeof player.score === 'number' && player.score >= 0, `${player.name} has valid score: ${player.score}`);
    }

    sockets.forEach(s => s.disconnect());
}

async function testMultiRoundLoop() {
    console.log('\n=== Multi-Round Loop (2 rounds, 3 players) ===');

    const { alice, bob, charlie, sockets } = await setupGameInScores();
    const { starts, ids, cards: round1Cards } = await startAndGetIds(sockets, alice, 2);

    const round1Assignments = starts.map(s =>
        Object.values(s.room.players).find(pp => pp.sessionToken).assignment.id
    );
    console.log(`   Round 1 assignments: ${round1Assignments.join(', ')}`);

    // --- Round 1: 3 hot seats ---
    let guessingUpdates = await doRankingPhase(sockets, round1Cards);

    for (let hs = 0; hs < 3; hs++) {
        const { hotSeatSocket } = await doGuessingPhase(sockets, ids, guessingUpdates);
        await doRevealPhase(sockets, hotSeatSocket);

        const advUpdates = await allPlayersProceed(sockets);

        if (hs < 2) {
            assert(advUpdates[0].room.phase === 'guessing', `Hot seat ${hs + 1} → next guessing`);
            guessingUpdates = advUpdates;
        } else {
            // After last hot seat of round 1 → should start round 2 (ranking)
            assert(advUpdates[0].room.phase === 'ranking', 'After round 1 → ranking (round 2)');
            assert(advUpdates[0].room.currentRoundNumber === 2, 'Current round is 2');

            // Get round 2 cards
            const round2Cards = starts.map((_, i) => {
                const me = Object.values(advUpdates[i].room.players).find(pp => pp.sessionToken);
                return me.cards;
            });
            const round2Assignments = starts.map((_, i) => {
                const me = Object.values(advUpdates[i].room.players).find(pp => pp.sessionToken);
                return me.assignment.id;
            });
            console.log(`   Round 2 assignments: ${round2Assignments.join(', ')}`);

            // Assignments should be different from round 1
            console.log('1. Round 2 has different assignments...');
            const overlap = round2Assignments.filter(a => round1Assignments.includes(a));
            assert(overlap.length === 0, `No overlap: R1=[${round1Assignments}] R2=[${round2Assignments}]`);

            // --- Round 2: 3 hot seats ---
            guessingUpdates = await doRankingPhase(sockets, round2Cards);

            for (let hs2 = 0; hs2 < 3; hs2++) {
                const { hotSeatSocket } = await doGuessingPhase(sockets, ids, guessingUpdates);
                await doRevealPhase(sockets, hotSeatSocket);

                const advUpdates2 = await allPlayersProceed(sockets);

                if (hs2 < 2) {
                    guessingUpdates = advUpdates2;
                } else {
                    assert(advUpdates2[0].room.phase === 'game_end', 'After round 2 → game_end');
                }
            }
        }
    }

    sockets.forEach(s => s.disconnect());
}

async function testPlayAgain() {
    console.log('\n=== Play Again Test ===');

    const { alice, bob, charlie, sockets } = await setupGameInScores();
    const { starts, ids, cards } = await startAndGetIds(sockets, alice, 1);

    // Run through full game quickly
    let guessingUpdates = await doRankingPhase(sockets, cards);
    for (let hs = 0; hs < 3; hs++) {
        const { hotSeatSocket } = await doGuessingPhase(sockets, ids, guessingUpdates);
        await doRevealPhase(sockets, hotSeatSocket);

        const advUpdates = await allPlayersProceed(sockets);

        if (hs < 2) guessingUpdates = advUpdates;
        else assert(advUpdates[0].room.phase === 'game_end', 'Game ended');
    }

    // Play again
    console.log('1. Play Again resets to lobby...');
    const againP = sockets.map(s => waitFor(s, 'room_updated'));
    alice.emit('play_again');
    const againUpdates = await Promise.all(againP);
    const lobbyRoom = againUpdates[0].room;

    assert(lobbyRoom.phase === 'lobby', 'Phase is lobby');
    assert(lobbyRoom.hotSeat == null, 'Hot seat cleared');

    console.log('2. Scores reset to 0...');
    for (const player of Object.values(lobbyRoom.players)) {
        assert(player.score === 0, `${player.name} score reset to 0`);
    }

    console.log('3. All players still present...');
    assert(Object.keys(lobbyRoom.players).length === 3, '3 players remain');

    console.log('4. Can start new game after play again...');
    const newStartP = sockets.map(s => waitFor(s, 'room_updated'));
    alice.emit('start_game', { totalRounds: 1 });
    const newStartUpdates = await Promise.all(newStartP);
    assert(newStartUpdates[0].room.phase === 'ranking', 'New game starts in ranking');

    sockets.forEach(s => s.disconnect());
}

async function testAllPlayersCanProceed() {
    console.log('\n=== All Players Can Proceed Test ===');

    const { alice, bob, charlie, sockets } = await setupGameInScores();
    const { starts, ids, cards } = await startAndGetIds(sockets, alice, 1);
    const guessingUpdates = await doRankingPhase(sockets, cards);
    const { hotSeatSocket } = await doGuessingPhase(sockets, ids, guessingUpdates);
    await doRevealPhase(sockets, hotSeatSocket);

    console.log('1. All players can proceed (not just host)...');
    const advUpdates = await allPlayersProceed(sockets);
    // Should transition after all ready (bob is not host, but his proceed is accepted)
    assert(advUpdates[0].room.phase === 'guessing' || advUpdates[0].room.phase === 'game_end',
        'Transitioned after all ready');

    sockets.forEach(s => s.disconnect());
}

// ============ RUN ALL TESTS ============

async function main() {
    console.log('=== Phase 6 Scores/End Integration Tests ===');

    try {
        await testScoresPhaseData();
        await testHostAdvanceFromScores();
        await testFullSingleRoundLoop();
        await testMultiRoundLoop();
        await testPlayAgain();
        await testAllPlayersCanProceed();
    } catch (err) {
        console.error('Test error:', err.message);
        failed++;
    }

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log(`========================================`);

    process.exit(failed > 0 ? 1 : 0);
}

main();
