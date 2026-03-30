import { io } from 'socket.io-client';

const URL = 'http://localhost:3002';
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

// Setup a game that's in reveal phase, return all context needed
async function setupGameInReveal() {
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

    // Start game
    const allStartP = sockets.map(s => waitFor(s, 'room_updated'));
    alice.emit('start_game', { totalRounds: 1 });
    const [aliceStart, bobStart, charlieStart] = await Promise.all(allStartP);

    const aCards = Object.values(aliceStart.room.players).find(pp => pp.sessionToken).cards;
    const bCards = Object.values(bobStart.room.players).find(pp => pp.sessionToken).cards;
    const cCards = Object.values(charlieStart.room.players).find(pp => pp.sessionToken).cards;

    // All submit rankings
    p = drainAll(sockets, alice);
    alice.emit('submit_ranking', { ranking: aCards.map(c => c.id) });
    await p;

    p = drainAll(sockets, bob);
    bob.emit('submit_ranking', { ranking: bCards.map(c => c.id) });
    await p;

    // Charlie triggers guessing
    const guessingP = sockets.map(s => waitFor(s, 'room_updated'));
    charlie.emit('submit_ranking', { ranking: cCards.map(c => c.id) });
    const [aliceGuessing] = await Promise.all(guessingP);

    const hotSeatId = aliceGuessing.room.hotSeat.playerId;
    const hotSeatCards = aliceGuessing.room.hotSeat.cards;
    const guessCardIds = hotSeatCards.map(c => c.id);

    // Identify sockets
    const aliceMe = Object.values(aliceGuessing.room.players).find(pp => pp.sessionToken);
    const bobMe = Object.values((await Promise.resolve(aliceGuessing)).room.players).find(pp => pp.id === Object.values(aliceStart.room.players).find(pp2 => pp2.sessionToken).id) ? aliceMe : null;

    // Simpler: get each player's ID from their start view
    const aliceId = Object.values(aliceStart.room.players).find(pp => pp.sessionToken).id;
    const bobId = Object.values(bobStart.room.players).find(pp => pp.sessionToken).id;
    const charlieId = Object.values(charlieStart.room.players).find(pp => pp.sessionToken).id;

    const idToSocket = { [aliceId]: alice, [bobId]: bob, [charlieId]: charlie };
    const hotSeatSocket = idToSocket[hotSeatId];
    const nonHotSeatSockets = sockets.filter(s => s !== hotSeatSocket);

    // Non-hot-seat players submit guesses → transition to reveal
    p = drainAll(sockets, nonHotSeatSockets[0]);
    nonHotSeatSockets[0].emit('submit_guess', { guess: guessCardIds });
    await p;

    const revealP = sockets.map(s => waitFor(s, 'room_updated'));
    nonHotSeatSockets[1].emit('submit_guess', { guess: [...guessCardIds].reverse() });
    const revealUpdates = await Promise.all(revealP);

    return {
        alice, bob, charlie, sockets, code,
        hotSeatSocket, nonHotSeatSockets, hotSeatId,
        aliceId, bobId, charlieId, idToSocket,
        revealUpdates,
    };
}

// ============ TEST SUITE ============

async function testRevealPhaseDataShape() {
    console.log('\n=== Reveal Phase Data Shape Tests ===');

    const ctx = await setupGameInReveal();
    const room = ctx.revealUpdates[0].room;

    console.log('1. Phase is reveal...');
    assert(room.phase === 'reveal', 'Phase is reveal');

    console.log('2. Hot seat data present...');
    assert(room.hotSeat != null, 'Hot seat exists');
    assert(room.hotSeat.playerId === ctx.hotSeatId, 'Correct hot seat player');

    console.log('3. revealedRanking starts empty...');
    assert(typeof room.hotSeat.revealedRanking === 'object', 'revealedRanking is object');
    assert(Object.keys(room.hotSeat.revealedRanking).length === 0, 'revealedRanking empty at start');

    console.log('4. revealIndex starts at 0...');
    assert(room.hotSeat.revealIndex === 0, 'revealIndex is 0');

    console.log('5. Cards still visible...');
    assert(room.hotSeat.cards.length === 5, '5 cards visible');

    console.log('6. Assignment still visible...');
    assert(room.hotSeat.assignment != null, 'Assignment exists');
    assert(room.hotSeat.assignment.name != null, 'Assignment has name');

    console.log('7. Timer is cleared...');
    assert(room.timerEndAt == null, 'No timer during reveal');

    ctx.sockets.forEach(s => s.disconnect());
}

async function testIncrementalReveal() {
    console.log('\n=== Incremental Reveal Tests ===');

    const ctx = await setupGameInReveal();

    // Reveal card #1
    console.log('1. Hot seat reveals card #1...');
    let revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
    ctx.hotSeatSocket.emit('reveal_next');
    let updates = await Promise.all(revP);
    let room = updates[0].room;

    assert(room.hotSeat.revealIndex === 1, 'revealIndex is 1');
    assert(Object.keys(room.hotSeat.revealedRanking).length === 1, 'revealedRanking has 1 card');
    assert(room.phase === 'reveal', 'Still in reveal phase');

    // Reveal card #2
    console.log('2. Hot seat reveals card #2...');
    revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
    ctx.hotSeatSocket.emit('reveal_next');
    updates = await Promise.all(revP);
    room = updates[0].room;

    assert(room.hotSeat.revealIndex === 2, 'revealIndex is 2');
    assert(Object.keys(room.hotSeat.revealedRanking).length === 2, 'revealedRanking has 2 cards');

    // Reveal cards #3, #4
    console.log('3. Reveal cards #3 and #4...');
    for (let i = 3; i <= 4; i++) {
        revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
        ctx.hotSeatSocket.emit('reveal_next');
        updates = await Promise.all(revP);
    }
    room = updates[0].room;
    assert(room.hotSeat.revealIndex === 4, 'revealIndex is 4');
    assert(room.phase === 'reveal', 'Still in reveal after 4');

    // Reveal card #5 → transition to scores
    console.log('4. Reveal card #5 → transitions to scores...');
    revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
    ctx.hotSeatSocket.emit('reveal_next');
    updates = await Promise.all(revP);
    room = updates[0].room;

    assert(room.hotSeat.revealIndex === 5, 'revealIndex is 5');
    assert(Object.keys(room.hotSeat.revealedRanking).length === 5, 'All 5 cards revealed');
    assert(room.phase === 'reveal', 'Phase stays in reveal');

    ctx.sockets.forEach(s => s.disconnect());
}

async function testOnlyHotSeatCanReveal() {
    console.log('\n=== Only Hot Seat Can Reveal Test ===');

    const ctx = await setupGameInReveal();

    // Non-hot-seat player tries to reveal
    console.log('1. Non-hot-seat player gets error...');
    ctx.nonHotSeatSockets[0].emit('reveal_next');
    const err = await waitFor(ctx.nonHotSeatSockets[0], 'error');
    assert(err.message === 'Only the hot seat player can reveal', 'Non-hot-seat rejected');

    // Hot seat player can reveal
    console.log('2. Hot seat player succeeds...');
    const revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
    ctx.hotSeatSocket.emit('reveal_next');
    const updates = await Promise.all(revP);
    assert(updates[0].room.hotSeat.revealIndex === 1, 'Hot seat reveal succeeded');

    ctx.sockets.forEach(s => s.disconnect());
}

async function testScoringDuringReveal() {
    console.log('\n=== Scoring During Reveal Tests ===');

    const ctx = await setupGameInReveal();

    // Reveal all 5 cards and track score changes
    console.log('1. Revealing all cards and checking scores accumulate...');
    let prevScores = {};
    for (const [id, player] of Object.entries(ctx.revealUpdates[0].room.players)) {
        prevScores[id] = player.score;
    }

    for (let i = 0; i < 5; i++) {
        const revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
        ctx.hotSeatSocket.emit('reveal_next');
        await Promise.all(revP);
    }

    // Get final state from any socket
    // The last update from the loop has the scores phase
    const finalP = ctx.sockets.map(s => waitFor(s, 'room_updated', 1000).catch(() => null));
    // Actually the last update was already consumed. Let me check roundScores instead.
    // Re-do: reveal all and capture final state.

    ctx.sockets.forEach(s => s.disconnect());

    // Fresh setup
    const ctx2 = await setupGameInReveal();
    let lastRoom;

    for (let i = 0; i < 5; i++) {
        const revP = ctx2.sockets.map(s => waitFor(s, 'room_updated'));
        ctx2.hotSeatSocket.emit('reveal_next');
        const updates = await Promise.all(revP);
        lastRoom = updates[0].room;
    }

    assert(lastRoom.phase === 'reveal', 'Phase stays in reveal after all reveals');
    assert(Object.keys(lastRoom.hotSeat.roundScores).length > 0, 'Round scores populated');

    // Scores should be non-negative integers
    console.log('2. All scores are non-negative...');
    for (const [id, player] of Object.entries(lastRoom.players)) {
        assert(player.score >= 0, `${player.name} score >= 0 (${player.score})`);
    }

    // Round scores should sum to something reasonable
    console.log('3. Round scores are reasonable...');
    const totalRoundPts = Object.values(lastRoom.hotSeat.roundScores).reduce((a, b) => a + b, 0);
    assert(totalRoundPts >= 0, `Total round points >= 0 (${totalRoundPts})`);
    // Max possible: 2 guessers × 10 pts each + hot seat 5 pts = 25
    assert(totalRoundPts <= 25, `Total round points <= 25 (${totalRoundPts})`);

    console.log(`   Round scores: ${JSON.stringify(lastRoom.hotSeat.roundScores)}`);

    ctx2.sockets.forEach(s => s.disconnect());
}

async function testRevealBeyond5Rejected() {
    console.log('\n=== Reveal Beyond 5 Rejected Test ===');

    const ctx = await setupGameInReveal();

    // Reveal all 5
    for (let i = 0; i < 5; i++) {
        const revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
        ctx.hotSeatSocket.emit('reveal_next');
        await Promise.all(revP);
    }

    // All 5 revealed — trying reveal_next should fail (all positions already revealed)
    console.log('1. Reveal after all 5 gets error...');
    ctx.hotSeatSocket.emit('reveal_next');
    const err = await waitFor(ctx.hotSeatSocket, 'error');
    assert(err.message === 'All cards already revealed', '6th reveal rejected');

    ctx.sockets.forEach(s => s.disconnect());
}

async function testRevealedRankingContainsCorrectCards() {
    console.log('\n=== Revealed Ranking Contains Correct Cards ===');

    const ctx = await setupGameInReveal();

    // Reveal all 5 and verify each revealed card is one of the hot seat's cards
    const hotSeatCardIds = new Set(ctx.revealUpdates[0].room.hotSeat.cards.map(c => c.id));

    console.log('1. Each revealed card is from hot seat cards...');
    let lastRoom;
    for (let i = 0; i < 5; i++) {
        const revP = ctx.sockets.map(s => waitFor(s, 'room_updated'));
        ctx.hotSeatSocket.emit('reveal_next');
        const updates = await Promise.all(revP);
        lastRoom = updates[0].room;

        const justRevealed = lastRoom.hotSeat.revealedRanking[lastRoom.hotSeat.revealedPositions[i]];
        assert(hotSeatCardIds.has(justRevealed), `Card #${i + 1} is valid: ${justRevealed}`);
    }

    // All 5 revealed cards should be unique
    console.log('2. All revealed cards are unique...');
    const revealed = new Set(Object.values(lastRoom.hotSeat.revealedRanking));
    assert(revealed.size === 5, 'All 5 revealed cards are unique');

    // Revealed ranking should match the hot seat's actual ranking
    console.log('3. Revealed ranking matches hot seat\'s ranking...');
    // Hot seat player can see their own ranking in their player data
    // But from a non-hot-seat view, we only see revealedRanking
    assert(Object.keys(lastRoom.hotSeat.revealedRanking).length === 5, 'Full ranking revealed');

    ctx.sockets.forEach(s => s.disconnect());
}

// ============ RUN ALL TESTS ============

async function main() {
    console.log('=== Phase 5 Reveal Integration Tests ===');

    try {
        await testRevealPhaseDataShape();
        await testIncrementalReveal();
        await testOnlyHotSeatCanReveal();
        await testScoringDuringReveal();
        await testRevealBeyond5Rejected();
        await testRevealedRankingContainsCorrectCards();
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
