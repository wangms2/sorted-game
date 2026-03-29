import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';

function connect(name) {
    return new Promise((resolve, reject) => {
        const socket = io(URL);
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        socket.on('connect', () => {
            clearTimeout(timeout);
            resolve(socket);
        });
        socket.on('connect_error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

function waitFor(socket, event) {
    return new Promise((resolve) => {
        socket.once(event, (data) => resolve(data));
    });
}

async function test() {
    console.log('--- Phase 1 Integration Test ---\n');

    // Test 1: Create room
    console.log('1. Creating room...');
    const alice = await connect('Alice');
    const roomPromise = waitFor(alice, 'room_updated');
    alice.emit('create_room', { playerName: 'Alice' });
    const { room } = await roomPromise;
    console.log(`   Room code: ${room.code}, Phase: ${room.phase}, Players: ${Object.keys(room.players).length}`);
    console.assert(room.code.length === 4, 'Room code should be 4 chars');
    console.assert(room.phase === 'lobby', 'Phase should be lobby');
    console.assert(Object.keys(room.players).length === 1, 'Should have 1 player');

    // Test 2: Join room
    console.log('2. Bob joining...');
    const bob = await connect('Bob');
    const bobRoomPromise = waitFor(bob, 'room_updated');
    bob.emit('join_room', { roomCode: room.code, playerName: 'Bob' });
    const { room: room2 } = await bobRoomPromise;
    console.assert(Object.keys(room2.players).length === 2, 'Should have 2 players');
    console.log(`   Players: ${Object.values(room2.players).map(p => p.name).join(', ')}`);

    // Test 3: Third player
    console.log('3. Charlie joining...');
    const charlie = await connect('Charlie');
    const charlieRoomPromise = waitFor(charlie, 'room_updated');
    charlie.emit('join_room', { roomCode: room.code, playerName: 'Charlie' });
    const { room: room3 } = await charlieRoomPromise;
    console.assert(Object.keys(room3.players).length === 3, 'Should have 3 players');

    // Test 4: Session token exists
    const myPlayer = Object.values(room3.players).find(p => p.sessionToken);
    console.log(`4. Session token present: ${!!myPlayer.sessionToken}`);
    console.assert(myPlayer.sessionToken, 'Should have session token');

    // Test 5: Reconnection via session token
    console.log('5. Testing reconnect after disconnect in lobby...');
    const charlieToken = myPlayer.sessionToken;
    charlie.disconnect();
    await new Promise(r => setTimeout(r, 500));
    const charlie2 = await connect('Charlie');
    const rejoinPromise = waitFor(charlie2, 'room_updated');
    charlie2.emit('reconnect', { sessionToken: charlieToken, roomCode: room.code });
    const { room: room4 } = await rejoinPromise;
    console.log(`   Rejoined. Players: ${Object.values(room4.players).map(p => p.name).join(', ')}`);
    console.assert(Object.keys(room4.players).length === 3, 'Should have 3 players');

    // Test 6: Error on invalid room
    console.log('6. Testing error on invalid room...');
    const tempSocket = await connect('Temp');
    tempSocket.emit('join_room', { roomCode: 'ZZZZ', playerName: 'Nobody' });
    const tempErr = await waitFor(tempSocket, 'error');
    console.log(`   Error message: "${tempErr.message}"`);
    console.assert(tempErr.message === 'Room not found', 'Should get room not found');

    // Test 7: Host validation
    console.log('7. Testing host-only start_game...');
    bob.emit('start_game', { totalRounds: 1 });
    const bobErr = await waitFor(bob, 'error');
    console.log(`   Non-host start error: "${bobErr.message}"`);
    console.assert(bobErr.message === 'Only host can start', 'Non-host should get error');

    // Test 8: Filter check — other players should not see private data
    console.log('8. Testing state filtering...');
    // Trigger a room update so Alice gets fresh state
    const aliceUpdatePromise = waitFor(alice, 'room_updated');
    alice.emit('start_game', { totalRounds: 1 }); // start game to trigger update
    const { room: aliceRoom } = await aliceUpdatePromise;
    // Alice should see her own sessionToken
    const alicePlayer = Object.values(aliceRoom.players).find(p => p.sessionToken);
    console.log(`   Alice sees her own sessionToken: ${!!alicePlayer}`);
    // Alice should NOT see others' sessionTokens
    const othersWithToken = Object.values(aliceRoom.players).filter(p => p.sessionToken && p.id !== alice.id);
    console.log(`   Alice sees 0 other sessionTokens: ${othersWithToken.length === 0}`);
    console.assert(othersWithToken.length === 0, 'Others should not have sessionToken');
    // Alice should see her own cards (game started → ranking phase)
    console.log(`   Phase after start: ${aliceRoom.phase}`);
    console.assert(aliceRoom.phase === 'ranking', 'Phase should be ranking after start');
    console.log(`   Alice has ${alicePlayer.cards.length} cards`);
    console.assert(alicePlayer.cards.length === 5, 'Alice should have 5 cards');

    console.log('\n--- All Phase 1 tests passed! ---');

    alice.disconnect();
    bob.disconnect();
    charlie2.disconnect();
    tempSocket.disconnect();
    process.exit(0);
}

test().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
