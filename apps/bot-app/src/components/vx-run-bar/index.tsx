import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import TradeAnimation from '@/components/trade-animation';
import { useStore } from '@/hooks/useStore';
import { getDemoMirrorStore } from '@/pages/bot-builder/demo-mirror/demo-mirror-store';
import { Localize } from '@deriv-com/translations';
import './vx-run-bar.scss';

const STORAGE_KEY = 'vx_fast_speed';

/**
 * Floating run bar pinned to the bottom-centre of the viewport.
 *
 * Replaces the old top-right `.main__run-strategy-wrapper` placement, which sat
 * at the same height as the tab strip and covered the last few tabs on narrower
 * viewports.
 *
 * The switch drops the per-trade contract-stage readout (the three-stage
 * animation that re-renders on every contract transition). Less render work
 * per trade, but it does NOT change order execution, latency, or anything
 * server-side.
 *
 * It was previously labelled "Execution Speed / FAST SPEED", which read as a
 * promise to trade faster. Roy toggled it expecting exactly that and nothing
 * changed. It is now "Trade display / LITE", because that is all it is.
 *
 * What actually sets trade rate is the market's tick interval: R_100 ticks
 * every 2s, 1HZ100V every 1s (both measured). With a 1-tick duration the bot
 * is already trading as fast as the platform allows.
 */
const VxRunBar = observer(() => {
    const root_store = useStore();
    const mirror_store = getDemoMirrorStore(root_store);

    const [is_fast, setIsFast] = React.useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) !== 'off';
        } catch {
            return true;
        }
    });

    const toggle = React.useCallback(() => {
        setIsFast(prev => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
            } catch {
                /* storage unavailable — keep the in-memory value */
            }
            return next;
        });
    }, []);

    return (
        <div className={classNames('vx-run-bar', { 'vx-run-bar--fast': is_fast })}>
            {mirror_store.is_armed && (
                <span className='vx-run-bar__mirror-badge' title='Demo trades are also firing on your real account'>
                    <span className='vx-run-bar__mirror-dot' />
                    MIRRORING TO REAL
                </span>
            )}
            <TradeAnimation className='vx-run-bar__animation' />
            <div className='vx-run-bar__divider' />
            <button
                type='button'
                className='vx-run-bar__speed'
                onClick={toggle}
                role='switch'
                aria-checked={is_fast}
            >
                <span className='vx-run-bar__speed-text'>
                    <span className='vx-run-bar__speed-label'>
                        <Localize i18n_default_text='Trade display' />
                    </span>
                    <span className='vx-run-bar__speed-value'>
                        {is_fast ? (
                            <Localize i18n_default_text='LITE' />
                        ) : (
                            <Localize i18n_default_text='FULL DETAIL' />
                        )}
                    </span>
                </span>
                <span className='vx-run-bar__switch' aria-hidden='true'>
                    <span className='vx-run-bar__knob' />
                </span>
            </button>
        </div>
    );
});

export default VxRunBar;
