import { useState, useEffect, useRef } from 'react';

export default function Timer({ timerEndAt, totalSeconds = 60 }) {
    const [secondsLeft, setSecondsLeft] = useState(() =>
        timerEndAt ? Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000)) : 0
    );
    const [fraction, setFraction] = useState(() =>
        timerEndAt ? Math.max(0, (timerEndAt - Date.now()) / (totalSeconds * 1000)) : 1
    );
    const rafRef = useRef(null);

    useEffect(() => {
        if (!timerEndAt) {
            setSecondsLeft(0);
            setFraction(0);
            return;
        }

        const totalMs = totalSeconds * 1000;

        const tick = () => {
            const now = Date.now();
            const remaining = Math.max(0, timerEndAt - now);
            setSecondsLeft(Math.ceil(remaining / 1000));
            setFraction(Math.max(0, remaining / totalMs));
            if (remaining > 0) {
                rafRef.current = requestAnimationFrame(tick);
            }
        };

        tick();
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [timerEndAt, totalSeconds]);

    if (!timerEndAt) return null;

    const urgent = secondsLeft <= 10;

    return (
        <div className="w-full">
            {/* Bar track */}
            <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                <div
                    className={`h-full bg-amber rounded-full transition-none ${urgent ? 'animate-pulse-bar' : ''}`}
                    style={{ width: `${fraction * 100}%` }}
                />
            </div>
            {/* Time label */}
            <p className={`text-center text-sm font-medium mt-2 tabular-nums ${urgent ? 'text-amber font-semibold' : 'text-charcoal/60'}`}>
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </p>
        </div>
    );
}
