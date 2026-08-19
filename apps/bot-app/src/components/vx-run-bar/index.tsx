import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import TradeAnimation from '@/components/trade-animation';
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
 * The "Fast speed" switch is a real setting, not decoration: with it on we drop
 * the per-trade contract-stage progress readout (the three-stage animation that
 * re-renders on every contract transition). That's genuinely less render work
 * per trade — it does NOT change order execution, latency, or anything
 * server-side, so it's labelled as a display speed control only.
 */
const VxRunBar = observer(() => {
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
                        <Localize i18n_default_text='Execution Speed' />
                    </span>
                    <span className='vx-run-bar__speed-value'>
                        {is_fast ? (
                            <Localize i18n_default_text='FAST SPEED' />
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
