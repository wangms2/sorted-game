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

// Setup a 3-player game in reveal phase, returns { sockets, hotSeatSocket, otherSockets, code }
async function setupRevealPhase() {
    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();
    const sockets = [alice, bob, charlie];

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
    const startResults = await Promise.all(allStartP);

    // Get each player's cards
    const getMyCards = (result) => Object.values(result.room.players).find(pp => pp.sessionToken).cards;
    const aCards = getMyCards(startResults[0]);
    const bCards = getMyCards(startResults[1]);
    const cCards = getMyCards(startResults[2]);

    // All submit rankings
    p = drainAll(sockets, alice);
    alice.emit('submit_ranking', { ranking: aCards.map(c => c.id) });
    await p;

    p = drainAll(sockets, bob);
    bob.emit('submit_ranking', { ranking: bCards.map(c => c.id) });
    await p;

    const guessingP = sockets.map(s => waitFor(s, 'room_updated'));
    charlie.emit('submit_ranking', { ranking: cCards.map(c => c.id) });
    const guessingResults = await Promise.all(guessingP);

    const hotSeatId = guessingResults[0].room.hotSeat.playerId;
    const hotSeatSocket = sockets.find(s => s.id === hotSeatId);
    const otherSockets = sockets.filter(s => s.id !== hotSeatId);
    const hotSeatCards = guessingResults[0].room.hotSeat.cards;

    // Non-hot-seat players submit guesses
    for (const s of otherSockets) {
        p = drainAll(sockets, s);
        s.emit('submit_guess', { guess: hotSeatCards.map(c => c.id) });
        await p;
    }

    // Now in reveal phase
    return { sockets, hotSeatSocket, otherSockets, code, hotSeatCards };
}

function cleanupSockets(sockets) {
    for (const s of sockets) {
        if (s.connected) s.disconnect();
    }
}

async function testAutoRevealOnHotSeatDisconnect() {
    console.log('\n=== Test: Auto-reveal when hot seat disconnects during reveal ===');

    const { sockets, hotSeatSocket, otherSockets } = await setupRevealPhase();

    // Verify we're in reveal phase
    const stateP = drainAll(sockets, otherSockets[0]);
    hotSeatSocket.emit('reveal_next');
    const preState = await stateP;
    assert(preState.room.phase === 'reveal', 'In reveal phase');
    assert(preState.room.hotSeat.revealIndex === 1, 'One card revealed');

    // Hot seat disconnects
    console.log('2. Hot seat disconnects...');
    const disconnectP = Promise.all(otherSockets.map(s => waitFor(s, 'room_updated')));
    hotSeatSocket.disconnect();
    await disconnectP;

    // Wait for auto-reveal (10s timer) + transition to scores (should happen automatically)
    console.log('3. Waiting for auto-reveal (10s)...');
    const autoRevealP = Promise.all(otherSockets.map(s => waitFor(s, 'room_updated', 15000)));
    const autoResults = await autoRevealP;

    const afterAutoReveal = autoResults[0];
    assert(afterAutoReveal.room.phase === 'reveal', 'Phase stays in reveal after auto-reveal');
    assert(afterAutoReveal.room.hotSeat.revealIndex === 5, 'All 5 cards revealed');

    console.log('4. Verifying round scores exist...');
    assert(Object.keys(afterAutoReveal.room.hotSeat.roundScores).length >= 0, 'roundScores present');

    cleanupSockets(sockets);
}

async function testAutoRevealWhenHotSeatDisconnectsDuringGuessing() {
    console.log('\n=== Test: Auto-reveal when hot seat disconnects during guessing ===');

    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();
    const sockets = [alice, bob, charlie];

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

    // Start game with short timers for testing
    const allStartP = sockets.map(s => waitFor(s, 'room_updated'));
    alice.emit('start_game', { totalRounds: 1 });
    const startResults = await Promise.all(allStartP);

    const getMyCards = (result) => Object.values(result.room.players).find(pp => pp.sessionToken).cards;
    const aCards = getMyCards(startResults[0]);
    const bCards = getMyCards(startResults[1]);
    const cCards = getMyCards(startResults[2]);

    // All submit rankings
    p = drainAll(sockets, alice);
    alice.emit('submit_ranking', { ranking: aCards.map(c => c.id) });
    await p;

    p = drainAll(sockets, bob);
    bob.emit('submit_ranking', { ranking: bCards.map(c => c.id) });
    await p;

    const guessingP = sockets.map(s => waitFor(s, 'room_updated'));
    charlie.emit('submit_ranking', { ranking: cCards.map(c => c.id) });
    const guessingResults = await Promise.all(guessingP);

    const hotSeatId = guessingResults[0].room.hotSeat.playerId;
    const hotSeatSocket = sockets.find(s => s.id === hotSeatId);
    const otherSockets = sockets.filter(s => s.id !== hotSeatId);
    const hotSeatCards = guessingResults[0].room.hotSeat.cards;

    console.log('1. In guessing phase, hot seat disconnects...');
    assert(guessingResults[0].room.phase === 'guessing', 'In guessing phase');

    // Hot seat disconnects during guessing
    const dcP = Promise.all(otherSockets.map(s => waitFor(s, 'room_updated')));
    hotSeatSocket.disconnect();
    await dcP;

    // Other players submit guesses → should transition to reveal, then auto-reveal after 10s
    console.log('2. Remaining players submit guesses...');
    for (let i = 0; i < otherSockets.length; i++) {
        const isLast = i === otherSockets.length - 1;
        if (isLast) {
            // Last guess triggers reveal transition
            const revealP = Promise.all(otherSockets.map(s => waitFor(s, 'room_updated')));
            otherSockets[i].emit('submit_guess', { guess: hotSeatCards.map(c => c.id) });
            const revealResults = await revealP;
            assert(revealResults[0].room.phase === 'reveal', 'Transitioned to reveal');
        } else {
            p = drainAll(otherSockets, otherSockets[i]);
            otherSockets[i].emit('submit_guess', { guess: hotSeatCards.map(c => c.id) });
            await p;
        }
    }

    console.log('3. Waiting for auto-reveal (10s)...');
    const autoP = Promise.all(otherSockets.map(s => waitFor(s, 'room_updated', 15000)));
    const autoResults = await autoP;

    assert(autoResults[0].room.phase === 'reveal', 'Auto-reveal stays in reveal');
    assert(autoResults[0].room.hotSeat.revealIndex === 5, 'All 5 cards auto-revealed');

    cleanupSockets(sockets);
}

async function testReconnectCancelsAutoReveal() {
    console.log('\n=== Test: Hot seat reconnect cancels auto-reveal ===');

    const { sockets, hotSeatSocket, otherSockets, code } = await setupRevealPhase();

    // Get session token before disconnect
    const sessionP = drainAll(sockets, hotSeatSocket);
    hotSeatSocket.emit('reveal_next');
    const hsState = await sessionP;
    const myPlayer = Object.values(hsState.room.players).find(pp => pp.sessionToken);
    const sessionToken = myPlayer.sessionToken;

    console.log('1. Hot seat disconnects...');
    const dcP = Promise.all(otherSockets.map(s => waitFor(s, 'room_updated')));
    hotSeatSocket.disconnect();
    await dcP;

    // Reconnect within the 10s window
    console.log('2. Hot seat reconnects within 10s...');
    await new Promise(r => setTimeout(r, 2000));
    const newSocket = await connect();

    const reconnectP = Promise.all([...otherSockets, newSocket].map(s => waitFor(s, 'room_updated')));
    newSocket.emit('reconnect', { sessionToken, roomCode: code });
    const reconnResults = await reconnectP;

    assert(reconnResults[0].room.phase === 'reveal', 'Still in reveal phase after reconnect');
    assert(reconnResults[0].room.hotSeat.revealIndex === 1, 'Reveal index preserved');

    // Wait past the original 10s window — should NOT auto-reveal
    console.log('3. Waiting 12s to confirm auto-reveal was cancelled...');
    let gotUpdate = false;
    const timeoutP = new Promise(resolve => {
        const listener = () => { gotUpdate = true; };
        otherSockets[0].on('room_updated', listener);
        setTimeout(() => {
            otherSockets[0].off('room_updated', listener);
            resolve();
        }, 12000);
    });
    await timeoutP;
    assert(!gotUpdate, 'No auto-reveal after reconnect (timer was cancelled)');

    // Hot seat can still manually reveal
    console.log('4. Hot seat can still manually reveal...');
    const revealP = Promise.all([...otherSockets, newSocket].map(s => waitFor(s, 'room_updated')));
    newSocket.emit('reveal_next');
    const revealResults = await revealP;
    assert(revealResults[0].room.phase === 'reveal', 'Still in reveal');
    assert(revealResults[0].room.hotSeat.revealIndex === 2, 'Manual reveal works');

    cleanupSockets([...sockets, newSocket]);
}

async function main() {
    console.log('========================================');
    console.log('Phase 7: Disconnected Hot Seat Auto-Reveal Tests');
    console.log('========================================');

    try {
        await testAutoRevealOnHotSeatDisconnect();
        await testAutoRevealWhenHotSeatDisconnectsDuringGuessing();
        await testReconnectCancelsAutoReveal();
    } catch (err) {
        console.error('Test error:', err);
        failed++;
    }

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('========================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

main();
