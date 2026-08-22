import { useEffect, useState } from 'react';
import classNames from 'classnames';
import VxDigitsEmbed from '@/components/vx-digits-embed';
import Backtest from './backtest';
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
 *
 * Expand takes the panel out of the tab shell and fixes it to the viewport.
 * The shell (header + nav + tab strip) structurally caps the embed near
 * 600px, while the digits-app needs roughly 750px to show everything without
 * its own inner scrollbar — trimming padding only bought ~19px, so escaping
 * the shell is the only thing that actually makes it fit.
 */
const MarketAnalysis = () => {
    const [view, setView] = useState<'circles' | 'scanner' | 'backtest'>('circles');
    const [is_expanded, setIsExpanded] = useState(false);

    // Esc collapses. Without this the only way back is the button, which sits
    // under the run bar's stacking context on short viewports.
    useEffect(() => {
        if (!is_expanded) return undefined;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsExpanded(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [is_expanded]);

    return (
        <div className={classNames('vx-analysis', { 'vx-analysis--expanded': is_expanded })}>
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
                <button
                    type='button'
                    className={view === 'backtest' ? 'is-active' : ''}
                    onClick={() => setView('backtest')}
                >
                    Backtest
                </button>
                <button
                    type='button'
                    className='vx-analysis__expand'
                    onClick={() => setIsExpanded(v => !v)}
                    aria-pressed={is_expanded}
                    title={is_expanded ? 'Collapse (Esc)' : 'Expand to full screen'}
                >
                    {is_expanded ? 'Collapse' : 'Expand'}
                </button>
            </div>
            <div className='vx-analysis__view'>
                {view === 'circles' && <VxDigitsEmbed />}
                {view === 'scanner' && <SignalScanner />}
                {view === 'backtest' && <Backtest />}
            </div>
        </div>
    );
};

export default MarketAnalysis;
