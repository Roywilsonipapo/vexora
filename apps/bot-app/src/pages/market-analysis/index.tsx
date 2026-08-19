import { useState } from 'react';
import VxDigitsEmbed from '@/components/vx-digits-embed';
import SignalScanner from './signal-scanner';
import './market-analysis.scss';

/**
 * Analysis Tool.
 *
 * "Circles" embeds the live Digits Analysis panel from the separately
 * deployed digits-app via its `?embed=1` mode, which strips that app's own
 * header/footer/login chrome (see digits-app/app/page.tsx).
 *
 * This tab used to recompute the digit statistics here instead. That is why
 * it was showing different numbers from the Digits app for the same symbol —
 * two independent implementations of the same maths will always drift, and
 * the one in this app was the wrong one. The digits-app owns those stats now;
 * this tab does not duplicate them.
 *
 * "Scanner" stays local because the digits-app has no cross-symbol scan.
 */
const MarketAnalysis = () => {
    const [view, setView] = useState<'circles' | 'scanner'>('circles');

    return (
        <div className='vx-analysis'>
            <div className='vx-analysis__viewtabs'>
                <button
                    type='button'
                    className={view === 'circles' ? 'is-active' : ''}
                    onClick={() => setView('circles')}
                >
                    Circles
                </button>
                <button
                    type='button'
                    className={view === 'scanner' ? 'is-active' : ''}
                    onClick={() => setView('scanner')}
                >
                    Scanner
                </button>
            </div>
            <div className='vx-analysis__view'>
                {view === 'circles' ? <VxDigitsEmbed /> : <SignalScanner />}
            </div>
        </div>
    );
};

export default MarketAnalysis;
