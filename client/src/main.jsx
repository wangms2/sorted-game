import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { GameProvider } from './context/GameContext.jsx';

// Keep Render free-tier alive while tab is open
setInterval(() => { fetch('/health').catch(() => { }); }, 5 * 60 * 1000);

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <GameProvider>
            <App />
        </GameProvider>
    </StrictMode>,
);
