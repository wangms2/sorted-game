import { useState, useEffect } from 'react';
import useGameState from '../../hooks/useGameState.js';
import PageLayout from '../ui/PageLayout.jsx';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

function getRoomFromURL() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    return code ? code.toUpperCase().slice(0, 4) : '';
}

export default function LandingScreen() {
    const { createRoom, joinRoom, error } = useGameState();
    const [name, setName] = useState('');
    const urlRoom = getRoomFromURL();
    const [roomCode, setRoomCode] = useState(urlRoom);
    const [mode, setMode] = useState(urlRoom.length === 4 ? 'join' : null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (error) setLoading(false);
    }, [error]);

    const handleCreate = () => {
        const trimmed = name.trim();
        if (trimmed.length < 1 || trimmed.length > 20) return;
        setLoading(true);
        createRoom(trimmed);
    };

    const handleJoin = (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        const code = roomCode.trim().toUpperCase();
        if (trimmed.length < 1 || trimmed.length > 20) return;
        if (code.length !== 4) return;
        setLoading(true);
        joinRoom(code, trimmed);
    };

    return (
        <PageLayout>
            <Card className="w-full max-w-md animate-fade-in">
                <h1 className="font-display text-6xl font-bold text-center text-charcoal mb-1 tracking-tight">
                    Sorted!
                </h1>
                <p className="text-center text-charcoal/50 mb-8 font-medium">
                    Rank it. Guess it. Prove you know your friends.
                </p>

                {!mode && (
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={20}
                            className="w-full px-4 py-3 rounded-xl bg-surface text-charcoal placeholder-charcoal/30 outline-none focus:ring-2 focus:ring-amber text-lg"
                        />
                        <Button
                            onClick={handleCreate}
                            disabled={!name.trim()}
                            loading={loading}
                        >
                            {loading ? 'Creating…' : 'Create Room'}
                        </Button>
                        <Button
                            onClick={() => name.trim() && setMode('join')}
                            disabled={!name.trim()}
                            variant="secondary"
                        >
                            Join Room
                        </Button>
                    </div>
                )}

                {mode === 'join' && (
                    <form onSubmit={handleJoin} className="space-y-4">
                        <p className="text-charcoal text-lg">
                            Joining as <span className="font-semibold">{name.trim() || '…'}</span>
                        </p>
                        <input
                            type="text"
                            placeholder="Your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={20}
                            className="w-full px-4 py-3 rounded-xl bg-surface text-charcoal placeholder-charcoal/30 outline-none focus:ring-2 focus:ring-amber text-lg"
                        />
                        <input
                            type="text"
                            placeholder="Room code (4 letters)"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
                            maxLength={4}
                            className="w-full px-4 py-3 rounded-xl bg-surface text-charcoal placeholder-charcoal/30 outline-none focus:ring-2 focus:ring-amber text-lg tracking-widest text-center"
                            autoFocus
                        />
                        <Button
                            type="submit"
                            disabled={roomCode.trim().length !== 4 || !name.trim()}
                            loading={loading}
                        >
                            {loading ? 'Joining…' : 'Join Room'}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => { setMode(null); setLoading(false); }}
                            disabled={loading}
                        >
                            Back
                        </Button>
                    </form>
                )}
            </Card>
        </PageLayout>
    );
}
