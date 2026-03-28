import useGameState from './hooks/useGameState.js';
import LandingScreen from './components/screens/LandingScreen.jsx';
import LobbyScreen from './components/screens/LobbyScreen.jsx';
import RankingScreen from './components/screens/RankingScreen.jsx';
import GuessingScreen from './components/screens/GuessingScreen.jsx';
import HotSeatWaitingScreen from './components/screens/HotSeatWaitingScreen.jsx';
import RevealScreen from './components/screens/RevealScreen.jsx';
import ScoresScreen from './components/screens/ScoresScreen.jsx';
import EndScreen from './components/screens/EndScreen.jsx';
import MidGameJoinScreen from './components/screens/MidGameJoinScreen.jsx';
import HostSidebar from './components/ui/HostSidebar.jsx';

export default function App() {
    const { room, currentPhase, isHotSeat, myPlayer, error, clearError } = useGameState();

    const screen = (() => {
        if (!room) return <LandingScreen />;
        if (myPlayer?.pendingMidGameChoice) return <MidGameJoinScreen />;
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
            <HostSidebar />
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
