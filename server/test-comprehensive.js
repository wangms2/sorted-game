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
    if (condition) { passed++; }
    else { failed++; console.error(`   FAIL: ${msg}`); }
}

async function collectUpdates(socket, count, timeoutMs = 3000) {
    const updates = [];
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(updates), timeoutMs);
        const handler = (data) => {
            updates.push(data);
            if (updates.length >= count) { clearTimeout(timeout); socket.off('room_updated', handler); resolve(updates); }
        };
        socket.on('room_updated', handler);
    });
}

// ============ TEST SUITE ============

async function testInputValidation() {
    console.log('\n=== Input Validation Tests ===');

    const s = await connect();

    // Empty name
    console.log('1. Empty name on create_room...');
    s.emit('create_room', { playerName: '' });
    const err1 = await waitFor(s, 'error');
    assert(err1.message === 'Name must be 1-20 characters', 'empty name error');
    console.log(`   ${err1.message}`);

    // Whitespace-only name
    console.log('2. Whitespace-only name...');
    s.emit('create_room', { playerName: '   ' });
    const err2 = await waitFor(s, 'error');
    assert(err2.message === 'Name must be 1-20 characters', 'whitespace name error');
    console.log(`   ${err2.message}`);

    // Name too long
    console.log('3. Name >20 chars...');
    s.emit('create_room', { playerName: 'A'.repeat(21) });
    const err3 = await waitFor(s, 'error');
    assert(err3.message === 'Name must be 1-20 characters', 'long name error');
    console.log(`   ${err3.message}`);

    // Null payload
    console.log('4. Null/undefined playerName...');
    s.emit('create_room', { playerName: null });
    const err4 = await waitFor(s, 'error');
    assert(err4.message === 'Name must be 1-20 characters', 'null name error');
    console.log(`   ${err4.message}`);

    // Missing roomCode on join
    console.log('5. Missing roomCode on join...');
    s.emit('join_room', { playerName: 'Test' });
    const err5 = await waitFor(s, 'error');
    assert(err5.message === 'Room code is required', 'missing room code error');
    console.log(`   ${err5.message}`);

    // Invalid reconnect data
    console.log('6. Invalid reconnect data...');
    s.emit('reconnect', { sessionToken: null, roomCode: null });
    const err6 = await waitFor(s, 'error');
    assert(err6.message === 'Invalid reconnect data', 'invalid reconnect error');
    console.log(`   ${err6.message}`);

    // Reconnect with non-existent room
    console.log('7. Reconnect to non-existent room...');
    s.emit('reconnect', { sessionToken: 'fake-token', roomCode: 'ZZZZ' });
    const err7 = await waitFor(s, 'error');
    assert(err7.message === 'Room not found', 'non-existent room reconnect');
    console.log(`   ${err7.message}`);

    s.disconnect();
}

async function testFullGameLifecycle() {
    console.log('\n=== Full Game Lifecycle Test ===');

    // Create room with Alice (host)
    const alice = await connect();
    const bobSocket = await connect();
    const charlie = await connect();

    console.log('1. Creating room...');
    const p1 = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await p1;
    const roomCode = room.code;
    console.log(`   Room: ${roomCode}`);

    console.log('2. Adding Bob + Charlie...');
    {
        const allP = [alice, bobSocket].map(s => waitFor(s, 'room_updated'));
        bobSocket.emit('join_room', { roomCode, playerName: 'Bob' });
        await Promise.all(allP);
    }

    {
        const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated'));
        charlie.emit('join_room', { roomCode, playerName: 'Charlie' });
        await Promise.all(allP);
    }

    // Start game
    console.log('3. Starting game (1 round)...');
    const aliceStart = waitFor(alice, 'room_updated');
    const bobStart = waitFor(bobSocket, 'room_updated');
    const charlieStart = waitFor(charlie, 'room_updated');
    alice.emit('start_game', { totalRounds: 1 });
    const [aData, bData, cData] = await Promise.all([aliceStart, bobStart, charlieStart]);

    assert(aData.room.phase === 'ranking', 'Alice sees ranking phase');
    assert(bData.room.phase === 'ranking', 'Bob sees ranking phase');
    assert(cData.room.phase === 'ranking', 'Charlie sees ranking phase');

    // Each player should see their own cards but not others'
    const alicePlayer = Object.values(aData.room.players).find(p => p.sessionToken);
    assert(alicePlayer.cards.length === 5, 'Alice has 5 cards');
    assert(alicePlayer.assignment !== null, 'Alice has assignment');

    // Bob (from Alice's view) should NOT have cards
    const bobFromAlice = Object.values(aData.room.players).find(p => p.name === 'Bob');
    assert(!bobFromAlice.cards, 'Bob has no cards in Alice\'s view');
    assert(!bobFromAlice.assignment, 'Bob has no assignment in Alice\'s view');

    // Each player should have different assignments
    const bobPlayer = Object.values(bData.room.players).find(p => p.sessionToken);
    const charliePlayer = Object.values(cData.room.players).find(p => p.sessionToken);
    assert(alicePlayer.assignment.id !== bobPlayer.assignment.id, 'Alice and Bob have different assignments');
    assert(bobPlayer.assignment.id !== charliePlayer.assignment.id, 'Bob and Charlie have different assignments');
    console.log(`   Assignments: Alice=${alicePlayer.assignment.name}, Bob=${bobPlayer.assignment.name}, Charlie=${charliePlayer.assignment.name}`);

    // Submit rankings
    console.log('4. Submitting rankings...');
    const aliceCardIds = alicePlayer.cards.map(c => c.id);
    const bobCardIds = bobPlayer.cards.map(c => c.id);
    const charlieCardIds = charliePlayer.cards.map(c => c.id);

    // Each submit sends room_updated to ALL players. 
    // We need to consume all updates to avoid stale events in later waitFor calls.
    {
        const ap = waitFor(alice, 'room_updated');
        const bp = waitFor(bobSocket, 'room_updated');
        const cp = waitFor(charlie, 'room_updated');
        alice.emit('submit_ranking', { ranking: aliceCardIds });
        await Promise.all([ap, bp, cp]);
    }
    {
        const ap = waitFor(alice, 'room_updated');
        const bp = waitFor(bobSocket, 'room_updated');
        const cp = waitFor(charlie, 'room_updated');
        bobSocket.emit('submit_ranking', { ranking: bobCardIds });
        await Promise.all([ap, bp, cp]);
    }

    // Last ranking from Charlie triggers guessing transition
    {
        const ap = waitFor(alice, 'room_updated');
        const bp = waitFor(bobSocket, 'room_updated');
        const cp = waitFor(charlie, 'room_updated');
        charlie.emit('submit_ranking', { ranking: charlieCardIds });
        const [aUp, bUp, cUp] = await Promise.all([ap, bp, cp]);
        var lastUpdate = cUp;
    }
    assert(lastUpdate.room.phase === 'guessing', 'Transitioned to guessing phase');
    console.log(`   Phase: ${lastUpdate.room.phase}`);

    // Verify hot seat
    assert(lastUpdate.room.hotSeat !== null, 'Hot seat is set');
    const hotSeatId = lastUpdate.room.hotSeat.playerId;
    console.log(`   Hot seat: ${lastUpdate.room.players[hotSeatId]?.name || 'unknown'}`);

    // Hot seat player should see their own cards in hotSeat
    assert(lastUpdate.room.hotSeat.cards.length === 5, 'Hot seat has 5 cards shown');
    assert(lastUpdate.room.hotSeat.assignment !== null, 'Hot seat has assignment');

    // Submit guesses (non-hot-seat players)
    console.log('5. Submitting guesses...');
    const hotSeatCards = lastUpdate.room.hotSeat.cards;
    const guessOrder = hotSeatCards.map(c => c.id); // guess in displayed order

    // Find who is and isn't hot seat
    const guessers = [alice, bobSocket, charlie].filter(s => s.id !== hotSeatId);
    const hotSeatSocket = [alice, bobSocket, charlie].find(s => s.id === hotSeatId);

    // Hot seat should NOT be able to guess
    hotSeatSocket.emit('submit_guess', { guess: guessOrder });
    const hotSeatErr = await waitFor(hotSeatSocket, 'error');
    assert(hotSeatErr.message === 'Hot seat player cannot guess', 'Hot seat cannot guess');
    console.log(`   Hot seat blocked from guessing: ${hotSeatErr.message}`);

    // Submit guesses — last guesser triggers transition to reveal
    // Drain all events from each emit
    for (let i = 0; i < guessers.length; i++) {
        const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated'));
        guessers[i].emit('submit_guess', { guess: guessOrder });
        await Promise.all(allP);
    }

    console.log('6. Reveal phase...');
    // Do 5 reveals — reveal emits to all, so drain all
    for (let i = 0; i < 5; i++) {
        const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated'));
        hotSeatSocket.emit('reveal_next');
        const results = await Promise.all(allP);
        const update = results[0]; // all should have same phase
        if (i < 4) {
            assert(update.room.phase === 'reveal', `Reveal ${i + 1}: still in reveal`);
            assert(update.room.hotSeat.revealIndex === i + 1, `Reveal index is ${i + 1}`);
        } else {
            assert(update.room.phase === 'reveal', 'After 5 reveals: still reveal phase');
        }
    }
    console.log('   All 5 cards revealed, waiting for proceed');

    // Non-hot-seat should NOT be able to reveal
    // (already in scores now, but test the check)

    // Advance from scores (all players click proceed)
    console.log('7. All players click proceed...');
    {
        // Each player emits advance_round; last one triggers transition
        for (const s of [bobSocket, charlie]) {
            const drainP = [alice, bobSocket, charlie].map(sock => waitFor(sock, 'room_updated', 2000).catch(() => { }));
            s.emit('advance_round');
            await Promise.all(drainP);
        }
        const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated', 8000));
        alice.emit('advance_round');
        var [advAlice, advBob, advCharlie] = await Promise.all(allP);
    }
    var advUpdate = advAlice;

    // With 3 players, 1 round: should now be guessing for next hot seat (or game_end if last)
    console.log(`   Phase after advance: ${advUpdate.room.phase}`);

    // Complete remaining hot seats quickly
    let currentPhase = advUpdate.room.phase;
    let safetyCounter = 0;
    while (currentPhase === 'guessing' && safetyCounter < 10) {
        safetyCounter++;

        // Get fresh state for the current hot seat
        const freshUpdate = advUpdate;
        const hs = freshUpdate.room.hotSeat;
        if (!hs) break;

        // Find current hot seat and guessers
        const currentHotSeatId = hs.playerId;
        const currentHotSeatSocket = [alice, bobSocket, charlie].find(s => s.id === currentHotSeatId);
        const currentGuessers = [alice, bobSocket, charlie].filter(s => s.id !== currentHotSeatId);
        const currentGuessCards = hs.cards.map(c => c.id);

        // Submit guesses — drain all events each time
        for (let i = 0; i < currentGuessers.length; i++) {
            const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated'));
            currentGuessers[i].emit('submit_guess', { guess: currentGuessCards });
            await Promise.all(allP);
        }

        // Reveal 5 cards — drain all events each time
        for (let i = 0; i < 5; i++) {
            const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated'));
            currentHotSeatSocket.emit('reveal_next');
            await Promise.all(allP);
        }

        // All players click proceed
        for (const s of [alice, bobSocket, charlie].slice(0, -1)) {
            const drainP = [alice, bobSocket, charlie].map(sock => waitFor(sock, 'room_updated', 2000).catch(() => { }));
            s.emit('advance_round');
            await Promise.all(drainP);
        }
        const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated', 8000));
        [alice, bobSocket, charlie].at(-1).emit('advance_round');
        const results = await Promise.all(allP);
        currentPhase = results[0].room.phase;
        // Update advUpdate for next iteration
        advUpdate = results[0];
        console.log(`   Phase after hot seat ${safetyCounter + 1}: ${currentPhase}`);
    }

    assert(currentPhase === 'game_end', 'Game ended after all hot seats');
    console.log('   Game ended!');

    // Play again — drain all
    console.log('8. Play again...');
    {
        const allP = [alice, bobSocket, charlie].map(s => waitFor(s, 'room_updated'));
        alice.emit('play_again');
        var [paA, paB, paC] = await Promise.all(allP);
    }
    const paUpdate = paA;
    assert(paUpdate.room.phase === 'lobby', 'Back to lobby after play again');
    console.log(`   Phase: ${paUpdate.room.phase}`);

    // Scores should be reset
    const paPlayers = Object.values(paUpdate.room.players);
    const allScoresZero = paPlayers.every(p => p.score === 0 || p.score === undefined);
    assert(allScoresZero, 'All scores reset to 0');

    alice.disconnect();
    bobSocket.disconnect();
    charlie.disconnect();
}

async function testDuplicateSubmissions() {
    console.log('\n=== Duplicate Submission Tests ===');

    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();

    const p1 = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await p1;

    bob.emit('join_room', { roomCode: room.code, playerName: 'Bob' });
    await waitFor(bob, 'room_updated');
    charlie.emit('join_room', { roomCode: room.code, playerName: 'Charlie' });
    await waitFor(charlie, 'room_updated');

    const startP = waitFor(alice, 'room_updated');
    alice.emit('start_game', { totalRounds: 1 });
    const { room: gameRoom } = await startP;

    const aliceCards = Object.values(gameRoom.players).find(p => p.sessionToken).cards.map(c => c.id);

    // Submit ranking
    console.log('1. Submit ranking twice...');
    alice.emit('submit_ranking', { ranking: aliceCards });
    await waitFor(alice, 'room_updated');

    // Try to submit again
    alice.emit('submit_ranking', { ranking: aliceCards });
    const dupErr = await waitFor(alice, 'error');
    assert(dupErr.message === 'Already submitted ranking', 'Duplicate ranking rejected');
    console.log(`   ${dupErr.message}`);

    // Submit invalid ranking (wrong card IDs)
    console.log('2. Invalid ranking card IDs...');
    bob.emit('submit_ranking', { ranking: ['fake-id-1', 'fake-id-2', 'fake-id-3', 'fake-id-4', 'fake-id-5'] });
    const invalidErr = await waitFor(bob, 'error');
    assert(invalidErr.message === 'Invalid ranking: must contain exactly your dealt cards', 'Invalid ranking rejected');
    console.log(`   ${invalidErr.message}`);

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
}

async function testRoomCapacity() {
    console.log('\n=== Room Capacity Tests ===');

    const host = await connect();
    const p = waitFor(host, 'room_updated');
    host.emit('create_room', { playerName: 'Host' });
    const { room } = await p;

    const sockets = [host];

    // Join 14 more players (total 15)
    console.log('1. Filling room to 15 players...');
    for (let i = 2; i <= 15; i++) {
        const s = await connect();
        const jp = waitFor(s, 'room_updated');
        s.emit('join_room', { roomCode: room.code, playerName: `P${i}` });
        await jp;
        sockets.push(s);
    }
    console.log(`   Room has ${sockets.length} players`);

    // 16th player should be rejected
    console.log('2. Rejecting 16th player...');
    const extra = await connect();
    extra.emit('join_room', { roomCode: room.code, playerName: 'Extra' });
    const capErr = await waitFor(extra, 'error');
    assert(capErr.message === 'Room is full', '16th player rejected');
    console.log(`   ${capErr.message}`);

    extra.disconnect();
    for (const s of sockets) s.disconnect();
}

async function testStartGameValidation() {
    console.log('\n=== Start Game Validation Tests ===');

    const alice = await connect();
    const bob = await connect();

    const p = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await p;
    bob.emit('join_room', { roomCode: room.code, playerName: 'Bob' });
    await waitFor(bob, 'room_updated');

    // Start with only 1 player (need at least 2)
    console.log('1. Start with 1 player (need 2)...');
    const soloHost = await connect();
    const sp = waitFor(soloHost, 'room_updated');
    soloHost.emit('create_room', { playerName: 'Solo' });
    const { room: soloRoom } = await sp;
    soloHost.emit('start_game', { totalRounds: 1 });
    const err1 = await waitFor(soloHost, 'error');
    assert(err1.message === 'Need at least 2 players to start', 'Need 2 players');
    console.log(`   ${err1.message}`);
    soloHost.disconnect();

    // Invalid round count
    console.log('2. Invalid round count (0)...');
    const charlie = await connect();
    charlie.emit('join_room', { roomCode: room.code, playerName: 'Charlie' });
    await waitFor(charlie, 'room_updated');

    alice.emit('start_game', { totalRounds: 0 });
    const err2 = await waitFor(alice, 'error');
    assert(err2.message === 'Rounds must be between 1 and 10', 'Invalid round count 0');
    console.log(`   ${err2.message}`);

    console.log('3. Invalid round count (11)...');
    alice.emit('start_game', { totalRounds: 11 });
    const err3 = await waitFor(alice, 'error');
    assert(err3.message === 'Rounds must be between 1 and 10', 'Invalid round count 11');
    console.log(`   ${err3.message}`);

    // Join after game started (mid-game join is allowed)
    console.log('4. Join after game started (mid-game join)...');
    alice.emit('start_game', { totalRounds: 1 });
    await waitFor(alice, 'room_updated');

    const latecomer = await connect();
    const lateP = waitFor(latecomer, 'room_updated');
    latecomer.emit('join_room', { roomCode: room.code, playerName: 'Late' });
    const { room: lateRoom } = await lateP;
    const latePlayer = Object.values(lateRoom.players).find(p => p.sessionToken);
    assert(latePlayer.pendingMidGameChoice === true, 'Mid-game joiner is pending choice');
    console.log(`   Mid-game join allowed, pending choice: ${latePlayer.pendingMidGameChoice}`);

    // Start again while game running
    console.log('5. Start again while game running...');
    alice.emit('start_game', { totalRounds: 1 });
    const err5 = await waitFor(alice, 'error');
    assert(err5.message === 'Game already started', 'Cannot start while running');
    console.log(`   ${err5.message}`);

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
    latecomer.disconnect();
}

async function testRevealValidation() {
    console.log('\n=== Reveal Validation Tests ===');

    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();

    const p = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await p;
    bob.emit('join_room', { roomCode: room.code, playerName: 'Bob' });
    await waitFor(bob, 'room_updated');
    charlie.emit('join_room', { roomCode: room.code, playerName: 'Charlie' });
    await waitFor(charlie, 'room_updated');

    // Start and get to ranking
    const startP = waitFor(alice, 'room_updated');
    alice.emit('start_game', { totalRounds: 1 });
    const { room: gameRoom } = await startP;

    // Reveal not allowed during ranking
    console.log('1. Reveal during ranking phase...');
    alice.emit('reveal_next');
    const err1 = await waitFor(alice, 'error');
    assert(err1.message === 'Not in reveal phase', 'Cannot reveal during ranking');
    console.log(`   ${err1.message}`);

    // Submit all rankings to get to guessing
    for (const s of [alice, bob, charlie]) {
        const pUpdate = waitFor(s, 'room_updated');
        const myCards = Object.values((await waitFor(s, 'room_updated', 100).catch(() => ({ room: gameRoom }))).room.players)
            .find(p => p.sessionToken)?.cards;
        if (myCards) {
            s.emit('submit_ranking', { ranking: myCards.map(c => c.id) });
        }
    }

    // Wait to settle into guessing
    await new Promise(r => setTimeout(r, 500));

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
}

async function testMidGameReconnect() {
    console.log('\n=== Mid-Game Reconnection Test ===');

    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();

    const p = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await p;
    bob.emit('join_room', { roomCode: room.code, playerName: 'Bob' });
    await waitFor(bob, 'room_updated');
    charlie.emit('join_room', { roomCode: room.code, playerName: 'Charlie' });
    await waitFor(charlie, 'room_updated');

    // Start game — drain from all 3
    {
        const allP = [alice, bob, charlie].map(s => waitFor(s, 'room_updated'));
        alice.emit('start_game', { totalRounds: 1 });
        var [startA, startB, startC] = await Promise.all(allP);
    }
    const gameRoom = startA.room;
    assert(gameRoom.phase === 'ranking', 'In ranking phase');

    // Get Charlie's session token from the start_game update
    console.log('1. Charlie disconnects mid-game...');
    const charlieStartRoom = startC.room;
    const charliePlayerData = Object.values(charlieStartRoom.players).find(p => p.sessionToken);
    const charlieSessionToken = charliePlayerData?.sessionToken;

    charlie.disconnect();
    await new Promise(r => setTimeout(r, 500));

    // Alice and Bob should see Charlie as disconnected — drain both
    const aliceUpdate = await waitFor(alice, 'room_updated', 3000).catch(() => null);
    const bobDiscoUpdate = await waitFor(bob, 'room_updated', 3000).catch(() => null);
    if (aliceUpdate) {
        const charlieInRoom = Object.values(aliceUpdate.room.players).find(p => p.name === 'Charlie');
        assert(charlieInRoom && !charlieInRoom.connected, 'Charlie shown as disconnected');
        console.log(`   Charlie connected: ${charlieInRoom?.connected}`);
    } else {
        console.log('   (No disconnect update received)');
    }

    // Charlie reconnects
    if (charlieSessionToken) {
        console.log('2. Charlie reconnects with session token...');
        const charlie2 = await connect();
        // Drain all 3 (charlie2 + alice + bob get room_updated)
        const allP = [charlie2, alice, bob].map(s => waitFor(s, 'room_updated'));
        charlie2.emit('reconnect', { sessionToken: charlieSessionToken, roomCode: room.code });
        const results = await Promise.all(allP);
        const { room: reconnRoom } = results[0];
        const reconnCharlie = Object.values(reconnRoom.players).find(p => p.name === 'Charlie');
        assert(reconnCharlie && reconnCharlie.connected, 'Charlie reconnected and shows connected');
        console.log(`   Charlie reconnected: ${reconnCharlie?.connected}`);

        // Charlie should still have their cards/assignment
        const reconnCharlieWithToken = Object.values(reconnRoom.players).find(p => p.sessionToken);
        assert(reconnCharlieWithToken.cards.length === 5, 'Charlie still has 5 cards after reconnect');
        assert(reconnCharlieWithToken.assignment !== null, 'Charlie still has assignment after reconnect');
        console.log(`   Cards preserved: ${reconnCharlieWithToken.cards.length}, Assignment: ${reconnCharlieWithToken.assignment?.name}`);

        charlie2.disconnect();
    } else {
        console.log('   SKIP: could not capture session token');
    }

    alice.disconnect();
    bob.disconnect();
}

async function testScoring() {
    console.log('\n=== Scoring Logic Tests ===');

    // Import scoring functions directly is not possible from test, but we can verify through gameplay
    // Instead, let's verify scores change correctly during reveal

    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();

    const p = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await p;
    bob.emit('join_room', { roomCode: room.code, playerName: 'Bob' });
    await waitFor(bob, 'room_updated');
    charlie.emit('join_room', { roomCode: room.code, playerName: 'Charlie' });
    await waitFor(charlie, 'room_updated');

    alice.emit('start_game', { totalRounds: 1 });
    // Drain start update from all sockets
    const [aUp, bUp, cUp] = await Promise.all([
        waitFor(alice, 'room_updated'),
        waitFor(bob, 'room_updated'),
        waitFor(charlie, 'room_updated'),
    ]);

    // Submit rankings for all players
    const aCards = Object.values(aUp.room.players).find(pp => pp.sessionToken).cards.map(c => c.id);
    const bCards = Object.values(bUp.room.players).find(pp => pp.sessionToken).cards.map(c => c.id);
    const cCards = Object.values(cUp.room.players).find(pp => pp.sessionToken).cards.map(c => c.id);

    // Drain all events on each ranking submit
    {
        const allP = [alice, bob, charlie].map(s => waitFor(s, 'room_updated'));
        alice.emit('submit_ranking', { ranking: aCards });
        await Promise.all(allP);
    }
    {
        const allP = [alice, bob, charlie].map(s => waitFor(s, 'room_updated'));
        bob.emit('submit_ranking', { ranking: bCards });
        await Promise.all(allP);
    }
    {
        const allP = [alice, bob, charlie].map(s => waitFor(s, 'room_updated'));
        charlie.emit('submit_ranking', { ranking: cCards });
        var [transA, transB, transC] = await Promise.all(allP);
    }
    var transData = transA;

    assert(transData.room.phase === 'guessing', 'In guessing phase for scoring test');
    const hotSeatId = transData.room.hotSeat.playerId;
    const hotSeatCards = transData.room.hotSeat.cards;
    console.log(`1. Hot seat: ${transData.room.players[hotSeatId]?.name || 'self'}`);

    // Guessers submit the exact same order as the hot seat player's ranking
    // (which we don't know, so we just guess in card order — scores will vary)
    const guessOrder = hotSeatCards.map(c => c.id);
    const guessers = [alice, bob, charlie].filter(s => s.id !== hotSeatId);
    const hotSeatSocket = [alice, bob, charlie].find(s => s.id === hotSeatId);

    // Drain all events on each guess submit
    for (let i = 0; i < guessers.length; i++) {
        const allP = [alice, bob, charlie].map(s => waitFor(s, 'room_updated'));
        guessers[i].emit('submit_guess', { guess: guessOrder });
        await Promise.all(allP);
    }

    // Reveal all 5 and track scores
    console.log('2. Revealing and checking scores update...');

    for (let i = 0; i < 5; i++) {
        const allP = [alice, bob, charlie].map(s => waitFor(s, 'room_updated'));
        hotSeatSocket.emit('reveal_next');
        const results = await Promise.all(allP);
        const rData = results[0];
        if (i === 4) {
            assert(rData.room.phase === 'reveal', 'Final reveal → reveal (awaiting proceed)');
            // Check round scores exist
            assert(rData.room.hotSeat.roundScores !== null, 'Round scores exist');
            console.log(`   Round scores: ${JSON.stringify(rData.room.hotSeat.roundScores)}`);
        }
    }

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
}

async function testPhaseGating() {
    console.log('\n=== Phase Gating Tests ===');

    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();

    // Setup room
    const p = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await p;
    bob.emit('join_room', { roomCode: room.code, playerName: 'Bob' });
    await waitFor(bob, 'room_updated');
    charlie.emit('join_room', { roomCode: room.code, playerName: 'Charlie' });
    await waitFor(charlie, 'room_updated');

    // In lobby: submit_ranking should fail
    console.log('1. submit_ranking in lobby...');
    alice.emit('submit_ranking', { ranking: ['a', 'b', 'c', 'd', 'e'] });
    const err1 = await waitFor(alice, 'error');
    assert(err1.message === 'Not in ranking phase', 'Cannot rank in lobby');
    console.log(`   ${err1.message}`);

    // In lobby: submit_guess should fail
    console.log('2. submit_guess in lobby...');
    alice.emit('submit_guess', { guess: ['a', 'b', 'c', 'd', 'e'] });
    const err2 = await waitFor(alice, 'error');
    assert(err2.message === 'Not in guessing phase', 'Cannot guess in lobby');
    console.log(`   ${err2.message}`);

    // In lobby: reveal_next should fail
    console.log('3. reveal_next in lobby...');
    alice.emit('reveal_next');
    const err3 = await waitFor(alice, 'error');
    assert(err3.message === 'Not in reveal phase', 'Cannot reveal in lobby');
    console.log(`   ${err3.message}`);

    // In lobby: advance_round should fail
    console.log('4. advance_round in lobby...');
    alice.emit('advance_round');
    const err4 = await waitFor(alice, 'error');
    assert(err4.message === 'Cannot proceed yet' || err4.message === 'Not in scores/reveal phase', 'Cannot advance in lobby');
    console.log(`   ${err4.message}`);

    // In lobby: play_again should fail
    console.log('5. play_again in lobby...');
    alice.emit('play_again');
    const err5 = await waitFor(alice, 'error');
    assert(err5.message === 'Game not ended', 'Cannot play again in lobby');
    console.log(`   ${err5.message}`);

    alice.disconnect();
    bob.disconnect();
    charlie.disconnect();
}

async function testConcurrentRoomCreation() {
    console.log('\n=== Concurrent Room Tests ===');

    console.log('1. Multiple rooms can exist simultaneously...');
    const s1 = await connect();
    const s2 = await connect();

    const p1 = waitFor(s1, 'room_updated');
    const p2 = waitFor(s2, 'room_updated');
    s1.emit('create_room', { playerName: 'Room1Host' });
    s2.emit('create_room', { playerName: 'Room2Host' });
    const [r1, r2] = await Promise.all([p1, p2]);

    assert(r1.room.code !== r2.room.code, 'Different room codes');
    console.log(`   Room 1: ${r1.room.code}, Room 2: ${r2.room.code}`);

    // Player can't be in two rooms
    console.log('2. Socket not in room tries game actions...');
    const orphan = await connect();
    orphan.emit('submit_ranking', { ranking: [] });
    const err = await waitFor(orphan, 'error');
    assert(err.message === 'Not in a room', 'Orphan socket gets error');
    console.log(`   ${err.message}`);

    s1.disconnect();
    s2.disconnect();
    orphan.disconnect();
}

async function testJoinRoomCaseInsensitivity() {
    console.log('\n=== Case Insensitivity Test ===');

    const host = await connect();
    const p = waitFor(host, 'room_updated');
    host.emit('create_room', { playerName: 'Host' });
    const { room } = await p;

    console.log(`1. Room code: ${room.code}, trying lowercase...`);
    const joiner = await connect();
    const jp = waitFor(joiner, 'room_updated');
    joiner.emit('join_room', { roomCode: room.code.toLowerCase(), playerName: 'Joiner' });
    const { room: joinedRoom } = await jp;
    assert(Object.keys(joinedRoom.players).length === 2, 'Joined with lowercase code');
    console.log(`   Joined successfully with lowercase code`);

    host.disconnect();
    joiner.disconnect();
}

async function testServerCrashResilience() {
    console.log('\n=== Server Crash Resilience Tests ===');

    const s = await connect();

    // Sending null data
    console.log('1. Null data on create_room...');
    s.emit('create_room', null);
    const err1 = await waitFor(s, 'error');
    assert(err1.message === 'Name must be 1-20 characters', 'Null data handled');
    console.log(`   ${err1.message}`);

    // Sending undefined (no data)
    console.log('2. No payload on join_room...');
    s.emit('join_room');
    const err2 = await waitFor(s, 'error');
    console.log(`   ${err2.message}`);
    assert(err2.message === 'Name must be 1-20 characters', 'No data handled');

    // Sending non-object
    console.log('3. String payload on start_game...');
    s.emit('start_game', 'hello');
    const err3 = await waitFor(s, 'error');
    console.log(`   ${err3.message}`);
    assert(err3.message === 'Not in a room', 'String data handled (not in room)');

    // Create room, then send bad ranking
    const p = waitFor(s, 'room_updated');
    s.emit('create_room', { playerName: 'Crash' });
    await p;

    console.log('4. Non-array ranking...');
    s.emit('submit_ranking', { ranking: 'not-an-array' });
    const err4 = await waitFor(s, 'error');
    console.log(`   ${err4.message}`);

    console.log('5. Null ranking...');
    s.emit('submit_ranking', { ranking: null });
    const err5 = await waitFor(s, 'error');
    console.log(`   ${err5.message}`);

    console.log('6. Submit_ranking with no data...');
    s.emit('submit_ranking');
    const err6 = await waitFor(s, 'error');
    console.log(`   ${err6.message}`);

    // Verify server is still alive
    console.log('7. Server still alive...');
    const health = await fetch('http://localhost:3002/health').then(r => r.json());
    assert(health.status === 'ok', 'Server still running after bad inputs');
    console.log(`   Health: ${health.status}`);

    s.disconnect();
}

// ============ RUN ALL ============

async function runAll() {
    console.log('╔════════════════════════════════════╗');
    console.log('║   Comprehensive Phase 1+2 Tests    ║');
    console.log('╚════════════════════════════════════╝');

    try {
        await testInputValidation();
        await testFullGameLifecycle();
        await testDuplicateSubmissions();
        await testRoomCapacity();
        await testStartGameValidation();
        await testRevealValidation();
        await testMidGameReconnect();
        await testScoring();
        await testPhaseGating();
        await testConcurrentRoomCreation();
        await testJoinRoomCaseInsensitivity();
        await testServerCrashResilience();

        console.log(`\n${'='.repeat(40)}`);
        console.log(`Results: ${passed} passed, ${failed} failed`);
        console.log(`${'='.repeat(40)}`);

        if (failed > 0) {
            console.log('\nSOME TESTS FAILED!');
            process.exit(1);
        } else {
            console.log('\nALL TESTS PASSED!');
            process.exit(0);
        }
    } catch (err) {
        console.error('\nTest suite crashed:', err);
        process.exit(1);
    }
}

runAll();
