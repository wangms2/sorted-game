import useGameState from './hooks/useGameState.js';
import LandingScreen from './components/screens/LandingScreen.jsx';
import LobbyScreen from './components/screens/LobbyScreen.jsx';
import RankingScreen from './components/screens/RankingScreen.jsx';
import GuessingScreen from './components/screens/GuessingScreen.jsx';
import HotSeatWaitingScreen from './components/screens/HotSeatWaitingScreen.jsx';
import RevealScreen from './components/screens/RevealScreen.jsx';
import ScoresScreen from './components/screens/ScoresScreen.jsx';
import EndScreen from './components/screens/EndScreen.jsx';

export default function App() {
    const { room, currentPhase, isHotSeat, error, clearError } = useGameState();

    const screen = (() => {
        if (!room) return <LandingScreen />;
        switch (currentPhase) {
            case 'lobby':
                return <LobbyScreen />;
            case 'ranking':
                return <RankingScreen />;
            case 'guessing':
                return (isHotSeat && room.mode !== 'coop') ? <HotSeatWaitingScreen /> : <GuessingScreen />;
            case 'reveal':
                return <RevealScreen />;
            case 'scores':
                return <ScoresScreen />;
            case 'game_end':
                return <EndScreen />;
            default:
                return <LandingScreen />;
        }
    })();

    return (
        <>
            {screen}
            {error && (
                <div
                    onClick={clearError}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border-2 border-amber text-charcoal px-6 py-3 rounded-xl shadow-card cursor-pointer animate-slide-up z-50 font-medium"
                >
                    {error}
                </div>
            )}
        </>
    );
}
