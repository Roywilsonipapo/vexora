import { useEffect, useState } from 'react';
import './splash-screen.scss';

const SPLASH_DURATION_MS = 3000;

const SplashScreen = () => {
    const [visible, setVisible] = useState(true);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        const fadeTimer = setTimeout(() => setFading(true), SPLASH_DURATION_MS - 400);
        const hideTimer = setTimeout(() => setVisible(false), SPLASH_DURATION_MS);
        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(hideTimer);
        };
    }, []);

    if (!visible) return null;

    return (
        <div className={`vexora-splash${fading ? ' vexora-splash--fade' : ''}`} role='status' aria-label='Loading Vexora'>
            <div className='vexora-splash__mark'>V</div>
            <div className='vexora-splash__name'>Vexora</div>
            <div className='vexora-splash__bar'>
                <div className='vexora-splash__bar-fill' />
            </div>
        </div>
    );
};

export default SplashScreen;
