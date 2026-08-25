import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { getAutoRunnerStore, TLogKind } from './auto-runner-store';
import './auto-runner.scss';

/**
 * Auto-Runner — presses Run, watches for the strategy's own take-profit or
 * stop-loss to end the run, announces the result by voice and chime, resets
 * the panel, and runs again. Tracks a running daily total across every cycle
 * and stops for the day once your own Daily Profit Target or Daily Loss
 * Limit is reached.
 *
 * This does not add a take-profit/stop-loss of its own — your strategy's own
 * blocks (or Quick Strategy settings) still decide when a single run ends.
 * Auto-Runner only decides what happens AFTER that: restart, or stop for
 * the day. The live orchestration lives in auto-runner-store.ts, not here —
 * see that file for why (this app's Tabs unmount inactive tabs, and this
 * has to keep running while you're looking at another tab).
 */

const STATUS_LABEL: Record<string, string> = {
    idle: 'Idle',
    running: 'Running',
    stopped_target: 'Target reached',
    stopped_loss: 'Loss limit reached',
    stopped_manual: 'Stopped',
    error: 'Needs attention',
};

const LOG_GLYPH: Record<TLogKind, string> = {
    start: '▶',
    'cycle-profit': '▲',
    'cycle-loss': '▼',
    target: '★',
    'loss-limit': '■',
    error: '!',
    stop: '■',
};

const AutoRunner = observer(() => {
    const root_store = useStore();
    const store = getAutoRunnerStore(root_store);
    const { client } = root_store;

    const [profitInput, setProfitInput] = useState<string>(store.daily_profit_target ? String(store.daily_profit_target) : '');
    const [lossInput, setLossInput] = useState<string>(store.daily_loss_limit ? String(store.daily_loss_limit) : '');

    const currency = client.currency || '';
    const { cumulative_profit, cycles_completed } = store.daily_state;

    const target = store.daily_profit_target;
    const limit = store.daily_loss_limit;
    const span = target + limit;
    const gauge_pct = span > 0 ? Math.min(100, Math.max(0, ((cumulative_profit + limit) / span) * 100)) : 50;

    const handleStart = () => {
        const target_val = Math.max(0, parseFloat(profitInput) || 0);
        const limit_val = Math.max(0, parseFloat(lossInput) || 0);
        store.setDailyProfitTarget(target_val);
        store.setDailyLossLimit(limit_val);
        store.start();
    };

    return (
        <div className='vx-autorun'>
            <div className='vx-autorun__head'>
                <div className='vx-autorun__title-row'>
                    <h2>Auto-Runner</h2>
                    <span className={`vx-autorun__status vx-autorun__status--${store.status}`}>
                        <span className='vx-autorun__status-dot' />
                        {STATUS_LABEL[store.status]}
                    </span>
                </div>
                <p>
                    Presses Run for you, listens for your strategy&rsquo;s own take-profit or stop-loss, announces the
                    result, resets, and runs again — until your daily target or loss limit is reached.
                    {currency ? ` Tracking in ${currency}.` : ''}
                </p>
            </div>

            <div className='vx-autorun__console'>
                <span className='vx-autorun__console-ring' aria-hidden='true' />
                <div className='vx-autorun__console-inner'>
                    <div className='vx-autorun__gauge'>
                        <div className='vx-autorun__gauge-track'>
                            <div className='vx-autorun__gauge-marker' style={{ left: `${gauge_pct}%` }} />
                            <div className='vx-autorun__gauge-zero' style={{ left: `${span > 0 ? (limit / span) * 100 : 50}%` }} />
                        </div>
                        <div className='vx-autorun__gauge-labels'>
                            <span>&minus;{limit ? limit.toFixed(2) : '—'}</span>
                            <span>0</span>
                            <span>+{target ? target.toFixed(2) : '—'}</span>
                        </div>
                    </div>

                    <div className={`vx-autorun__total ${cumulative_profit >= 0 ? 'is-pos' : 'is-neg'}`}>
                        <span className='vx-autorun__total-label'>Today&rsquo;s total</span>
                        <span className='vx-autorun__total-value'>
                            {cumulative_profit >= 0 ? '+' : ''}
                            {cumulative_profit.toFixed(2)} {currency}
                        </span>
                        <span className='vx-autorun__total-sub'>{cycles_completed} cycle{cycles_completed === 1 ? '' : 's'} today</span>
                    </div>

                    <div className='vx-autorun__inputs'>
                        <label>
                            <span>Daily profit target</span>
                            <div className='vx-autorun__input-wrap'>
                                <input
                                    type='number'
                                    min='0'
                                    step='0.01'
                                    placeholder='0 = off'
                                    value={profitInput}
                                    disabled={store.is_active}
                                    onChange={e => setProfitInput(e.target.value)}
                                />
                                <span>{currency}</span>
                            </div>
                        </label>
                        <label>
                            <span>Daily loss limit</span>
                            <div className='vx-autorun__input-wrap'>
                                <input
                                    type='number'
                                    min='0'
                                    step='0.01'
                                    placeholder='0 = off'
                                    value={lossInput}
                                    disabled={store.is_active}
                                    onChange={e => setLossInput(e.target.value)}
                                />
                                <span>{currency}</span>
                            </div>
                        </label>
                    </div>

                    <div className='vx-autorun__toggles'>
                        <button
                            type='button'
                            className={`vx-autorun__toggle ${store.sound_on ? 'is-on' : ''}`}
                            onClick={() => store.setSoundOn(!store.sound_on)}
                        >
                            <span className='vx-autorun__toggle-track' />
                            Chime
                        </button>
                        <button
                            type='button'
                            className={`vx-autorun__toggle ${store.voice_on ? 'is-on' : ''}`}
                            onClick={() => store.setVoiceOn(!store.voice_on)}
                        >
                            <span className='vx-autorun__toggle-track' />
                            Voice
                        </button>
                    </div>

                    {store.is_active ? (
                        <button type='button' className='vx-autorun__cta vx-autorun__cta--stop' onClick={store.stop}>
                            <span className='vx-autorun__cta-pulse' />
                            Stop Auto-Runner
                        </button>
                    ) : (
                        <button type='button' className='vx-autorun__cta vx-autorun__cta--start' onClick={handleStart}>
                            Start Auto-Runner
                        </button>
                    )}

                    {!store.is_active && (
                        <p className='vx-autorun__hint'>
                            Load your strategy in Bot Builder first. Auto-Runner presses the same Run button — it
                            can&rsquo;t start without a strategy loaded there.
                        </p>
                    )}
                </div>
            </div>

            <div className='vx-card vx-autorun__log'>
                <h3>Live log</h3>
                {store.log.length === 0 ? (
                    <p className='vx-autorun__empty'>Nothing yet — start Auto-Runner to see cycles appear here.</p>
                ) : (
                    <ul>
                        {store.log.map(entry => (
                            <li key={entry.id} className={`vx-autorun__log-item vx-autorun__log-item--${entry.kind}`}>
                                <span className='vx-autorun__log-glyph'>{LOG_GLYPH[entry.kind]}</span>
                                <span className='vx-autorun__log-text'>{entry.text}</span>
                                <span className='vx-autorun__log-time'>
                                    {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <p className='vx-autorun__note'>
                Auto-Runner automates pressing Run and Reset around your own strategy — it does not add its own
                take-profit or stop-loss. Those still come from your strategy&rsquo;s blocks or Quick Strategy
                settings. If you stop the bot manually from the run panel while Auto-Runner is active, it will treat
                that as the end of a cycle and restart — use &ldquo;Stop Auto-Runner&rdquo; above for a clean stop.
            </p>
        </div>
    );
});

export default AutoRunner;
