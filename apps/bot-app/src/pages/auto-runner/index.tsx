import { RefObject, useEffect, useRef, useState } from 'react';
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

// Dial geometry — a 180° arc read left-to-right (loss limit → target), same
// semicircle-gauge trick throughout: angle 180° is the left end, 0° the
// right end, sweeping clockwise over the top.
const DIAL_CX = 100;
const DIAL_CY = 100;
const DIAL_R = 86;
const polarPoint = (pct: number) => {
    const angleDeg = 180 - (Math.max(0, Math.min(100, pct)) / 100) * 180;
    const angleRad = (angleDeg * Math.PI) / 180;
    return { x: DIAL_CX + DIAL_R * Math.cos(angleRad), y: DIAL_CY - DIAL_R * Math.sin(angleRad) };
};
const dialArc = (fromPct: number, toPct: number) => {
    const start = polarPoint(fromPct);
    const end = polarPoint(toPct);
    return `M ${start.x} ${start.y} A ${DIAL_R} ${DIAL_R} 0 0 1 ${end.x} ${end.y}`;
};

// Slow-drifting particle field behind the console — purely decorative, reads
// as "flight deck" ambience. Respects prefers-reduced-motion (renders one
// static frame instead of animating) and tears its own loop down on unmount,
// since this whole page unmounts whenever you leave the tab.
const useStarfield = (canvasRef: RefObject<HTMLCanvasElement>) => {
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let width = 0;
        let height = 0;
        let stars: { x: number; y: number; r: number; speed: number; phase: number }[] = [];

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            width = canvas.width = rect.width;
            height = canvas.height = rect.height;
            const count = Math.round((width * height) / 9000);
            stars = Array.from({ length: count }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                r: Math.random() * 1.2 + 0.3,
                speed: Math.random() * 0.15 + 0.03,
                phase: Math.random() * Math.PI * 2,
            }));
        };
        resize();
        window.addEventListener('resize', resize);

        let raf = 0;
        let t = 0;
        const draw = () => {
            ctx.clearRect(0, 0, width, height);
            t += 0.02;
            stars.forEach(s => {
                s.y -= s.speed;
                if (s.y < 0) s.y = height;
                const twinkle = 0.35 + 0.5 * Math.abs(Math.sin(t + s.phase));
                ctx.fillStyle = `rgba(245, 214, 122, ${twinkle})`;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            });
            if (!reduce) raf = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [canvasRef]);
};

const AutoRunner = observer(() => {
    const root_store = useStore();
    const store = getAutoRunnerStore(root_store);
    const { client } = root_store;
    const starfieldRef = useRef<HTMLCanvasElement>(null);
    useStarfield(starfieldRef);

    const [profitInput, setProfitInput] = useState<string>(store.daily_profit_target ? String(store.daily_profit_target) : '');
    const [lossInput, setLossInput] = useState<string>(store.daily_loss_limit ? String(store.daily_loss_limit) : '');

    const currency = client.currency || '';
    const { cumulative_profit, cycles_completed } = store.daily_state;

    const target = store.daily_profit_target;
    const limit = store.daily_loss_limit;
    const span = target + limit;
    const gauge_pct = span > 0 ? Math.min(100, Math.max(0, ((cumulative_profit + limit) / span) * 100)) : 50;
    const zero_pct = span > 0 ? (limit / span) * 100 : 50;

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
                <canvas className='vx-autorun__stars' ref={starfieldRef} aria-hidden='true' />
                <span className='vx-autorun__console-ring' aria-hidden='true' />
                <div className='vx-autorun__console-inner'>
                    <div className={`vx-autorun__dial ${cumulative_profit >= 0 ? 'is-pos' : 'is-neg'}`}>
                        <svg viewBox='0 0 200 112' className='vx-autorun__dial-svg' aria-hidden='true'>
                            <defs>
                                <linearGradient id='vx-autorun-dial-gradient' x1='0' y1='0' x2='1' y2='0'>
                                    <stop offset='0%' stopColor='#ef4444' />
                                    <stop offset={`${zero_pct}%`} stopColor='#8a8990' />
                                    <stop offset='100%' stopColor='#f5d67a' />
                                </linearGradient>
                            </defs>
                            <path className='vx-autorun__dial-track' d={dialArc(0, 100)} />
                            <path
                                className='vx-autorun__dial-fill'
                                d={dialArc(Math.min(zero_pct, gauge_pct), Math.max(zero_pct, gauge_pct))}
                            />
                            <line
                                className='vx-autorun__dial-zero'
                                x1={polarPoint(zero_pct).x}
                                y1={polarPoint(zero_pct).y - 7}
                                x2={polarPoint(zero_pct).x}
                                y2={polarPoint(zero_pct).y + 7}
                            />
                            <circle
                                className='vx-autorun__dial-marker'
                                cx={polarPoint(gauge_pct).x}
                                cy={polarPoint(gauge_pct).y}
                                r='5.5'
                            />
                        </svg>
                        <div className='vx-autorun__dial-readout'>
                            <span className='vx-autorun__dial-label'>Today&rsquo;s total</span>
                            <span className='vx-autorun__dial-value'>
                                {cumulative_profit >= 0 ? '+' : ''}
                                {cumulative_profit.toFixed(2)}
                            </span>
                            <span className='vx-autorun__dial-currency'>{currency}</span>
                        </div>
                        <div className='vx-autorun__dial-labels'>
                            <span>&minus;{limit ? limit.toFixed(2) : '—'}</span>
                            <span>{cycles_completed} cycle{cycles_completed === 1 ? '' : 's'} today</span>
                            <span>+{target ? target.toFixed(2) : '—'}</span>
                        </div>
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

                    <div className='vx-autorun__launch-row'>
                        {store.is_active ? (
                            <button type='button' className='vx-autorun__launch vx-autorun__launch--stop' onClick={store.stop}>
                                <span className='vx-autorun__launch-ring' />
                                <span className='vx-autorun__launch-ring vx-autorun__launch-ring--2' />
                                <span className='vx-autorun__launch-label'>Stop</span>
                            </button>
                        ) : (
                            <button type='button' className='vx-autorun__launch vx-autorun__launch--start' onClick={handleStart}>
                                <span className='vx-autorun__launch-label'>Launch</span>
                            </button>
                        )}
                    </div>

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
