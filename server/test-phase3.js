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

// Drain room_updated from all sockets, return the one for targetSocket
async function drainAll(sockets, targetSocket, timeoutMs = 3000) {
    const promises = sockets.map(s => waitFor(s, 'room_updated', timeoutMs).catch(() => null));
    const results = await Promise.all(promises);
    const targetIdx = sockets.indexOf(targetSocket);
    return results[targetIdx];
}

async function setupThreePlayerRoom() {
    const alice = await connect();
    const bob = await connect();
    const charlie = await connect();
    const sockets = [alice, bob, charlie];

    // Alice creates room
    const aliceP = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await aliceP;
    const code = room.code;

    // Bob joins
    const bobP = drainAll(sockets, bob);
    bob.emit('join_room', { roomCode: code, playerName: 'Bob' });
    await bobP;

    // Charlie joins
    const charlieP = drainAll(sockets, charlie);
    charlie.emit('join_room', { roomCode: code, playerName: 'Charlie' });
    await charlieP;

    return { alice, bob, charlie, sockets, code };
}

// ============ TEST SUITE ============

async function testRankingPhaseTransition() {
    console.log('\n=== Ranking Phase Transition Tests ===');

    const { alice, bob, charlie, sockets, code } = await setupThreePlayerRoom();

    // Start game
    console.log('1. Starting game with 1 round...');
    const startP = drainAll(sockets, alice);
    alice.emit('start_game', { totalRounds: 1 });
    const startUpdate = await startP;
    assert(startUpdate.room.phase === 'ranking', 'Phase transitions to ranking');

    // Each player should have assignment and cards
    console.log('2. My player has assignment data...');
    const myPlayer = Object.values(startUpdate.room.players).find(p => p.sessionToken);
    assert(myPlayer != null, 'Found my player');
    assert(myPlayer.assignment != null, 'Player has assignment');
    assert(myPlayer.assignment.name != null, 'Assignment has name');
    assert(myPlayer.assignment.scale != null, 'Assignment has scale');
    assert(typeof myPlayer.assignment.type === 'string', 'Assignment has type');
    assert(Array.isArray(myPlayer.cards), 'Player has cards array');
    assert(myPlayer.cards.length === 5, 'Player has 5 cards');

    // Cards should have id and text
    console.log('3. Cards have correct shape...');
    const card = myPlayer.cards[0];
    assert(card.id != null, 'Card has id');
    assert(card.text != null, 'Card has text');

    // Other players should NOT have assignment/cards visible
    console.log('4. Other players assignment/cards are hidden...');
    const otherPlayers = Object.values(startUpdate.room.players).filter(p => !p.sessionToken);
    for (const op of otherPlayers) {
        assert(op.assignment == null, `Other player ${op.name} assignment hidden`);
        assert(op.cards == null, `Other player ${op.name} cards hidden`);
    }

    // Timer should be set
    console.log('5. Timer is set...');
    assert(startUpdate.room.timerEndAt != null, 'Timer is set');
    assert(startUpdate.room.timerEndAt > Date.now(), 'Timer is in the future');

    // hasRanked should be false for all
    console.log('6. Nobody has ranked yet...');
    for (const p of Object.values(startUpdate.room.players)) {
        assert(p.hasRanked === false, `${p.name} hasRanked is false`);
    }

    sockets.forEach(s => s.disconnect());
}

async function testSubmitRanking() {
    console.log('\n=== Submit Ranking Tests ===');

    const { alice, bob, charlie, sockets, code } = await setupThreePlayerRoom();

    // Start game
    const startP = drainAll(sockets, alice);
    alice.emit('start_game', { totalRounds: 1 });
    const startData = await startP;

    // Get each player's cards from their POV
    const aliceCards = Object.values(startData.room.players).find(p => p.sessionToken).cards;
    const aliceCardIds = aliceCards.map(c => c.id);

    // Get bob's and charlie's cards from their POV
    const bobStartP = drainAll(sockets, bob);
    alice.emit('start_game', { totalRounds: 1 }); // This will error (game already started), but we need bob's view
    // Actually let's get bob's view from the initial start
    // We need to re-approach: bob already got his start event during drainAll

    // Let me just re-setup to get each player's cards properly
    sockets.forEach(s => s.disconnect());

    // Fresh setup
    const s = await setupThreePlayerRoom();

    // Start game - get all three perspectives
    const allStartPromises = s.sockets.map(sock => waitFor(sock, 'room_updated'));
    s.alice.emit('start_game', { totalRounds: 1 });
    const [aliceStart, bobStart, charlieStart] = await Promise.all(allStartPromises);

    // Extract each player's cards from their own perspective
    const alicePlayer = Object.values(aliceStart.room.players).find(p => p.sessionToken);
    const bobPlayer = Object.values(bobStart.room.players).find(p => p.sessionToken);
    const charliePlayer = Object.values(charlieStart.room.players).find(p => p.sessionToken);

    // Each player should have DIFFERENT assignments
    console.log('1. Each player has a different assignment...');
    const assignmentIds = [alicePlayer.assignment.id, bobPlayer.assignment.id, charliePlayer.assignment.id];
    const uniqueIds = new Set(assignmentIds);
    assert(uniqueIds.size === 3, `All 3 assignments unique: ${assignmentIds.join(', ')}`);

    // Alice submits ranking
    console.log('2. Alice submits ranking...');
    const aliceRanking = alicePlayer.cards.map(c => c.id);
    const aliceSubmitP = drainAll(s.sockets, s.alice);
    s.alice.emit('submit_ranking', { ranking: aliceRanking });
    const aliceSubmitUpdate = await aliceSubmitP;

    assert(aliceSubmitUpdate.room.phase === 'ranking', 'Phase still ranking after 1 submit');
    const aliceSelf = Object.values(aliceSubmitUpdate.room.players).find(p => p.sessionToken);
    assert(aliceSelf.hasRanked === true, 'Alice hasRanked is true');

    // Bob submits ranking
    console.log('3. Bob submits ranking...');
    const bobRanking = bobPlayer.cards.map(c => c.id).reverse();
    const bobSubmitP = drainAll(s.sockets, s.bob);
    s.bob.emit('submit_ranking', { ranking: bobRanking });
    const bobSubmitUpdate = await bobSubmitP;
    assert(bobSubmitUpdate.room.phase === 'ranking', 'Phase still ranking after 2 submits');

    // Charlie submits - should trigger transition to guessing
    console.log('4. Charlie submits (last) -> transitions to guessing...');
    const charlieRanking = charliePlayer.cards.map(c => c.id);
    const transitionP = drainAll(s.sockets, s.charlie);
    s.charlie.emit('submit_ranking', { ranking: charlieRanking });
    const transitionUpdate = await transitionP;
    assert(transitionUpdate.room.phase === 'guessing', 'Phase transitions to guessing after all submit');

    // Verify hot seat is set
    console.log('5. Hot seat is set after transition...');
    assert(transitionUpdate.room.hotSeat != null, 'Hot seat object exists');
    assert(transitionUpdate.room.hotSeat.playerId != null, 'Hot seat has playerId');
    assert(transitionUpdate.room.hotSeat.assignment != null, 'Hot seat has assignment');
    assert(Array.isArray(transitionUpdate.room.hotSeat.cards), 'Hot seat has cards array');
    assert(transitionUpdate.room.hotSeat.cards.length === 5, 'Hot seat has 5 cards');

    s.sockets.forEach(so => so.disconnect());
}

async function testInvalidRanking() {
    console.log('\n=== Invalid Ranking Tests ===');

    const { alice, bob, charlie, sockets } = await setupThreePlayerRoom();

    // Start game
    const allStartP = sockets.map(s => waitFor(s, 'room_updated'));
    alice.emit('start_game', { totalRounds: 1 });
    const [aliceStart] = await Promise.all(allStartP);
    const alicePlayer = Object.values(aliceStart.room.players).find(p => p.sessionToken);

    // Submit with wrong card IDs
    console.log('1. Reject ranking with wrong card IDs...');
    alice.emit('submit_ranking', { ranking: ['fake_1', 'fake_2', 'fake_3', 'fake_4', 'fake_5'] });
    const err1 = await waitFor(alice, 'error');
    assert(err1.message.includes('Invalid ranking'), 'Wrong IDs rejected');

    // Submit with too few cards
    console.log('2. Reject ranking with too few cards...');
    alice.emit('submit_ranking', { ranking: [alicePlayer.cards[0].id] });
    const err2 = await waitFor(alice, 'error');
    assert(err2.message.includes('Invalid ranking'), 'Too few cards rejected');

    // Submit with non-array
    console.log('3. Reject non-array ranking...');
    alice.emit('submit_ranking', { ranking: 'not-an-array' });
    const err3 = await waitFor(alice, 'error');
    assert(err3.message.includes('Invalid ranking'), 'Non-array rejected');

    // Submit with null data
    console.log('4. Reject null payload...');
    alice.emit('submit_ranking', null);
    const err4 = await waitFor(alice, 'error');
    assert(err4.message.includes('Invalid ranking'), 'Null payload rejected');

    // Valid submit should work
    console.log('5. Valid ranking accepted...');
    const validRanking = alicePlayer.cards.map(c => c.id);
    const validP = drainAll(sockets, alice);
    alice.emit('submit_ranking', { ranking: validRanking });
    const validUpdate = await validP;
    const updatedAlice = Object.values(validUpdate.room.players).find(p => p.sessionToken);
    assert(updatedAlice.hasRanked === true, 'Valid ranking accepted');

    // Duplicate submit should be rejected
    console.log('6. Reject duplicate ranking...');
    alice.emit('submit_ranking', { ranking: validRanking });
    const err5 = await waitFor(alice, 'error');
    assert(err5.message.includes('Already submitted'), 'Duplicate rejected');

    sockets.forEach(s => s.disconnect());
}

async function testDifferentAssignmentsPerPlayer() {
    console.log('\n=== Different Assignments Per Player ===');

    // Test with more players (5)
    const sockets = [];
    for (let i = 0; i < 5; i++) {
        sockets.push(await connect());
    }

    // Create room
    const createP = waitFor(sockets[0], 'room_updated');
    sockets[0].emit('create_room', { playerName: 'Player0' });
    const { room } = await createP;
    const code = room.code;

    // Join remaining players
    for (let i = 1; i < 5; i++) {
        const joinP = drainAll(sockets, sockets[i]);
        sockets[i].emit('join_room', { roomCode: code, playerName: `Player${i}` });
        await joinP;
    }

    // Start game
    console.log('1. Starting 5-player game...');
    const allStartP = sockets.map(s => waitFor(s, 'room_updated'));
    sockets[0].emit('start_game', { totalRounds: 1 });
    const startUpdates = await Promise.all(allStartP);

    // Each player should have a unique assignment
    console.log('2. All 5 players have unique assignments...');
    const assignments = startUpdates.map(u => {
        const me = Object.values(u.room.players).find(p => p.sessionToken);
        return me.assignment;
    });

    const ids = assignments.map(a => a.id);
    const uniqueAssignments = new Set(ids);
    assert(uniqueAssignments.size === 5, `5 unique assignments: ${ids.join(', ')}`);

    // All assignments should have same type (all category or all situation for one round)
    console.log('3. All assignments are same type (category or situation)...');
    const types = assignments.map(a => a.type);
    const uniqueTypes = new Set(types);
    assert(uniqueTypes.size === 1, `All same type: ${types[0]}`);

    // Each player's cards should be different
    console.log('4. Each player has different cards...');
    const allCardSets = startUpdates.map(u => {
        const me = Object.values(u.room.players).find(p => p.sessionToken);
        return new Set(me.cards.map(c => c.id));
    });

    let anyOverlap = false;
    for (let i = 0; i < allCardSets.length; i++) {
        for (let j = i + 1; j < allCardSets.length; j++) {
            for (const id of allCardSets[i]) {
                if (allCardSets[j].has(id)) { anyOverlap = true; break; }
            }
        }
    }
    assert(!anyOverlap, 'No card overlap between players');

    sockets.forEach(s => s.disconnect());
}

async function testMultiRoundFlow() {
    console.log('\n=== Multi-Round Flow Test ===');

    const { alice, bob, charlie, sockets } = await setupThreePlayerRoom();

    // Start with 2 rounds
    console.log('1. Starting 2-round game...');
    const allStartP = sockets.map(s => waitFor(s, 'room_updated'));
    alice.emit('start_game', { totalRounds: 2 });
    const [aliceStart, bobStart, charlieStart] = await Promise.all(allStartP);

    assert(aliceStart.room.totalRounds === 2, 'Total rounds is 2');
    assert(aliceStart.room.currentRoundNumber === 1, 'Current round is 1');

    // Get each player's cards
    const aPlayer = Object.values(aliceStart.room.players).find(p => p.sessionToken);
    const bPlayer = Object.values(bobStart.room.players).find(p => p.sessionToken);
    const cPlayer = Object.values(charlieStart.room.players).find(p => p.sessionToken);

    // Record round 1 assignments
    const round1Assignments = [aPlayer.assignment.id, bPlayer.assignment.id, cPlayer.assignment.id];
    console.log(`   Round 1 assignments: ${round1Assignments.join(', ')}`);

    // All submit rankings
    console.log('2. All players submit rankings...');
    // Alice submits
    let p = drainAll(sockets, alice);
    alice.emit('submit_ranking', { ranking: aPlayer.cards.map(c => c.id) });
    await p;

    // Bob submits
    p = drainAll(sockets, bob);
    bob.emit('submit_ranking', { ranking: bPlayer.cards.map(c => c.id) });
    await p;

    // Charlie submits (triggers guessing)
    p = drainAll(sockets, charlie);
    charlie.emit('submit_ranking', { ranking: cPlayer.cards.map(c => c.id) });
    const guessingUpdate = await p;

    assert(guessingUpdate.room.phase === 'guessing', 'Phase transitioned to guessing');
    console.log('   -> Transitioned to guessing phase');

    sockets.forEach(s => s.disconnect());
}

// ============ RUN ALL TESTS ============

async function main() {
    console.log('=== Phase 3 Ranking Integration Tests ===');

    try {
        await testRankingPhaseTransition();
        await testSubmitRanking();
        await testInvalidRanking();
        await testDifferentAssignmentsPerPlayer();
        await testMultiRoundFlow();
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
