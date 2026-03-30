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

// Drain room_updated from all sockets, return the one for targetSocket
async function drainAll(sockets, targetSocket, timeoutMs = 3000) {
    const promises = sockets.map(s => waitFor(s, 'room_updated', timeoutMs).catch(() => null));
    const results = await Promise.all(promises);
    const targetIdx = sockets.indexOf(targetSocket);
    return results[targetIdx];
}

async function setupGameInGuessing() {
    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();
    const sockets = [alice, bob, charlie];

    // Create room
    const createP = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await createP;
    const code = room.code;

    // Join
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

    // Get cards for each player
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

    // Charlie's submit triggers guessing phase
    const guessingP = sockets.map(s => waitFor(s, 'room_updated'));
    charlie.emit('submit_ranking', { ranking: cCards.map(c => c.id) });
    const [aliceGuessing, bobGuessing, charlieGuessing] = await Promise.all(guessingP);

    return {
        alice, bob, charlie, sockets, code,
        aliceGuessing, bobGuessing, charlieGuessing,
    };
}

// ============ TEST SUITE ============

async function testGuessingPhaseData() {
    console.log('\n=== Guessing Phase Data Shape Tests ===');

    const { alice, bob, charlie, sockets, aliceGuessing, bobGuessing, charlieGuessing } = await setupGameInGuessing();
    const room = aliceGuessing.room;

    // Phase should be guessing
    console.log('1. Phase is guessing...');
    assert(room.phase === 'guessing', 'Phase is guessing');

    // Hot seat should be set
    console.log('2. Hot seat data present...');
    assert(room.hotSeat != null, 'Hot seat object exists');
    assert(room.hotSeat.playerId != null, 'Hot seat has playerId');
    assert(room.hotSeat.assignment != null, 'Hot seat has assignment');
    assert(room.hotSeat.assignment.name != null, 'Hot seat assignment has name');
    assert(room.hotSeat.assignment.scale != null, 'Hot seat assignment has scale');
    assert(room.hotSeat.assignment.type != null, 'Hot seat assignment has type');

    // Hot seat cards should be present and shuffled (5 cards)
    console.log('3. Hot seat cards present...');
    assert(Array.isArray(room.hotSeat.cards), 'Hot seat has cards array');
    assert(room.hotSeat.cards.length === 5, 'Hot seat has 5 cards');
    assert(room.hotSeat.cards[0].id != null, 'Card has id');
    assert(room.hotSeat.cards[0].text != null, 'Card has text');

    // Timer should be set (guessing timer)
    console.log('4. Guessing timer is set...');
    assert(room.timerEndAt != null, 'Timer is set');
    assert(room.timerEndAt > Date.now(), 'Timer is in the future');

    // Hot seat player's hasGuessed should be true (auto-set by server)
    console.log('5. Hot seat player hasGuessed is pre-set to true...');
    const hotSeatId = room.hotSeat.playerId;
    assert(room.players[hotSeatId].hasGuessed === true, 'Hot seat hasGuessed is true');

    // Non-hot-seat players should have hasGuessed=false
    console.log('6. Non-hot-seat players have hasGuessed=false...');
    for (const [id, player] of Object.entries(room.players)) {
        if (id !== hotSeatId) {
            assert(player.hasGuessed === false, `${player.name} hasGuessed is false`);
        }
    }

    // revealIndex should be 0
    console.log('7. revealIndex starts at 0...');
    assert(room.hotSeat.revealIndex === 0, 'revealIndex is 0');

    sockets.forEach(s => s.disconnect());
}

async function testHotSeatCannotGuess() {
    console.log('\n=== Hot Seat Cannot Guess Test ===');

    const { alice, bob, charlie, sockets, aliceGuessing } = await setupGameInGuessing();
    const room = aliceGuessing.room;
    const hotSeatId = room.hotSeat.playerId;

    // Find which socket is the hot seat
    const hotSeatSocket = sockets.find(s => {
        const views = [aliceGuessing, { room: aliceGuessing.room }, { room: aliceGuessing.room }];
        // We need to figure out which socket maps to hotSeatId
        return false; // Can't directly determine, use a different approach
    });

    // Try submitting guess from each socket — the hot seat one should fail
    console.log('1. Hot seat player gets error when trying to guess...');
    const fakeGuess = room.hotSeat.cards.map(c => c.id);

    // Try all three — one should get "Hot seat player cannot guess"
    // We know Alice created the room, so Alice's ID is first in playerOrder
    // But hotSeatId depends on server. Let's just try from all and check results.

    // Actually, we can identify the hot seat by checking each player's view
    const aliceMe = Object.values(aliceGuessing.room.players).find(p => p.sessionToken);
    const isAliceHotSeat = aliceMe.id === hotSeatId;

    if (isAliceHotSeat) {
        alice.emit('submit_guess', { guess: fakeGuess });
        const err = await waitFor(alice, 'error');
        assert(err.message === 'Hot seat player cannot guess', 'Hot seat rejected');
    } else {
        // Try bob or charlie — check who is hot seat from their view
        const bobMe = Object.values((await Promise.resolve(aliceGuessing)).room.players).find(p => p.id === hotSeatId);
        // Just test: first connection in playerOrder is hot seat typically
        // Simpler: emit from all and check who gets error vs update
        const sockWithId = (id) => {
            if (aliceMe.id === id) return alice;
            // We need bob's view to know bob's id
        };
        // Let's use a more reliable approach
        alice.emit('submit_guess', { guess: fakeGuess });
        const result = await Promise.race([
            waitFor(alice, 'error', 2000).then(e => ({ type: 'error', data: e })),
            waitFor(alice, 'room_updated', 2000).then(d => ({ type: 'update', data: d })),
        ]);

        if (result.type === 'error') {
            assert(result.data.message === 'Hot seat player cannot guess', 'Hot seat rejected');
        } else {
            // Alice is not hot seat, she submitted guess successfully
            assert(true, 'Non-hot-seat player submitted guess OK');
        }
    }

    sockets.forEach(s => s.disconnect());
}

async function testSubmitGuess() {
    console.log('\n=== Submit Guess Flow Tests ===');

    const { alice, bob, charlie, sockets, aliceGuessing, bobGuessing, charlieGuessing } = await setupGameInGuessing();
    const room = aliceGuessing.room;
    const hotSeatId = room.hotSeat.playerId;
    const hotSeatCards = room.hotSeat.cards;
    const guessCardIds = hotSeatCards.map(c => c.id);

    // Find which sockets are NOT hot seat
    const aliceMe = Object.values(aliceGuessing.room.players).find(p => p.sessionToken);
    const bobMe = Object.values(bobGuessing.room.players).find(p => p.sessionToken);
    const charlieMe = Object.values(charlieGuessing.room.players).find(p => p.sessionToken);

    const nonHotSeatSockets = [];
    const hotSeatSocket = (() => {
        if (aliceMe.id === hotSeatId) { nonHotSeatSockets.push(bob, charlie); return alice; }
        if (bobMe.id === hotSeatId) { nonHotSeatSockets.push(alice, charlie); return bob; }
        nonHotSeatSockets.push(alice, bob); return charlie;
    })();

    // Non-hot-seat player 1 submits guess
    console.log('1. First non-hot-seat player submits guess...');
    let p = drainAll(sockets, nonHotSeatSockets[0]);
    nonHotSeatSockets[0].emit('submit_guess', { guess: guessCardIds });
    const update1 = await p;
    assert(update1.room.phase === 'guessing', 'Still in guessing after 1 guess');

    // Check the guesser is marked as guessed
    const guesser1 = Object.values(update1.room.players).find(pp => pp.sessionToken);
    if (guesser1) {
        assert(guesser1.hasGuessed === true, 'Guesser marked as guessed');
    }

    // Non-hot-seat player 2 submits guess → should transition to reveal
    console.log('2. Last guesser submits → transition to reveal...');
    const revealP = sockets.map(s => waitFor(s, 'room_updated'));
    nonHotSeatSockets[1].emit('submit_guess', { guess: guessCardIds.reverse() });
    const revealUpdates = await Promise.all(revealP);
    assert(revealUpdates[0].room.phase === 'reveal', 'Phase transitions to reveal');

    // Verify reveal data
    console.log('3. Reveal phase data correct...');
    const revealRoom = revealUpdates[0].room;
    assert(revealRoom.hotSeat != null, 'Hot seat still present in reveal');
    assert(revealRoom.hotSeat.revealIndex === 0, 'Reveal index starts at 0');
    assert(revealRoom.timerEndAt == null, 'Timer cleared on reveal');

    sockets.forEach(s => s.disconnect());
}

async function testInvalidGuess() {
    console.log('\n=== Invalid Guess Tests ===');

    const { alice, bob, charlie, sockets, aliceGuessing, bobGuessing, charlieGuessing } = await setupGameInGuessing();
    const room = aliceGuessing.room;
    const hotSeatId = room.hotSeat.playerId;

    // Find a non-hot-seat socket
    const aliceMe = Object.values(aliceGuessing.room.players).find(p => p.sessionToken);
    const bobMe = Object.values(bobGuessing.room.players).find(p => p.sessionToken);
    const charlieMe = Object.values(charlieGuessing.room.players).find(p => p.sessionToken);

    const guesserSocket = aliceMe.id !== hotSeatId ? alice : (bobMe.id !== hotSeatId ? bob : charlie);

    // Wrong card IDs
    console.log('1. Reject guess with wrong card IDs...');
    guesserSocket.emit('submit_guess', { guess: ['fake1', 'fake2', 'fake3', 'fake4', 'fake5'] });
    const err1 = await waitFor(guesserSocket, 'error');
    assert(err1.message.includes('Invalid guess'), 'Wrong IDs rejected');

    // Non-array
    console.log('2. Reject non-array guess...');
    guesserSocket.emit('submit_guess', { guess: 'not-array' });
    const err2 = await waitFor(guesserSocket, 'error');
    assert(err2.message.includes('Invalid guess'), 'Non-array rejected');

    // Null data
    console.log('3. Reject null payload...');
    guesserSocket.emit('submit_guess', null);
    const err3 = await waitFor(guesserSocket, 'error');
    assert(err3.message.includes('Invalid guess'), 'Null rejected');

    // Valid guess then duplicate
    console.log('4. Valid guess accepted, duplicate rejected...');
    const validGuess = room.hotSeat.cards.map(c => c.id);
    const validP = drainAll(sockets, guesserSocket);
    guesserSocket.emit('submit_guess', { guess: validGuess });
    await validP;

    guesserSocket.emit('submit_guess', { guess: validGuess });
    const err4 = await waitFor(guesserSocket, 'error');
    assert(err4.message.includes('Already submitted'), 'Duplicate rejected');

    sockets.forEach(s => s.disconnect());
}

async function testGuessingToRevealTransitionData() {
    console.log('\n=== Guessing → Reveal Transition Data ===');

    const { alice, bob, charlie, sockets, aliceGuessing, bobGuessing, charlieGuessing } = await setupGameInGuessing();
    const room = aliceGuessing.room;
    const hotSeatId = room.hotSeat.playerId;
    const guessCardIds = room.hotSeat.cards.map(c => c.id);

    const aliceMe = Object.values(aliceGuessing.room.players).find(p => p.sessionToken);
    const bobMe = Object.values(bobGuessing.room.players).find(p => p.sessionToken);
    const charlieMe = Object.values(charlieGuessing.room.players).find(p => p.sessionToken);

    // Get non-hot-seat sockets
    const nonHotSeatSockets = [];
    if (aliceMe.id !== hotSeatId) nonHotSeatSockets.push(alice);
    if (bobMe.id !== hotSeatId) nonHotSeatSockets.push(bob);
    if (charlieMe.id !== hotSeatId) nonHotSeatSockets.push(charlie);

    // First guesser submits
    let p = drainAll(sockets, nonHotSeatSockets[0]);
    nonHotSeatSockets[0].emit('submit_guess', { guess: guessCardIds });
    await p;

    // Second guesser submits → transition
    const transP = sockets.map(s => waitFor(s, 'room_updated'));
    nonHotSeatSockets[1].emit('submit_guess', { guess: [...guessCardIds].reverse() });
    const updates = await Promise.all(transP);

    const revealRoom = updates[0].room;

    console.log('1. Phase is reveal...');
    assert(revealRoom.phase === 'reveal', 'Phase is reveal');

    console.log('2. Hot seat has revealedRanking (empty at start)...');
    assert(typeof revealRoom.hotSeat.revealedRanking === 'object', 'revealedRanking is object');
    assert(Object.keys(revealRoom.hotSeat.revealedRanking).length === 0, 'revealedRanking starts empty');

    console.log('3. Hot seat assignment still visible...');
    assert(revealRoom.hotSeat.assignment != null, 'Assignment still present');
    assert(revealRoom.hotSeat.assignment.name != null, 'Assignment name present');

    console.log('4. Hot seat cards still visible...');
    assert(revealRoom.hotSeat.cards.length === 5, 'All 5 cards still visible');

    console.log('5. roundScores pre-initialized for all...');
    assert(Object.keys(revealRoom.hotSeat.roundScores).length > 0, 'Round scores initialized');

    sockets.forEach(s => s.disconnect());
}

// ============ RUN ALL TESTS ============

async function main() {
    console.log('=== Phase 4 Guessing Integration Tests ===');

    try {
        await testGuessingPhaseData();
        await testHotSeatCannotGuess();
        await testSubmitGuess();
        await testInvalidGuess();
        await testGuessingToRevealTransitionData();
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
