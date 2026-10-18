import { useCallback, useEffect, useRef, useState } from 'react';
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

// Rotating background art — purely decorative, crossfades on a timer. Add or
// remove images by editing this list; nothing else needs to change.
const ART_IMAGES = [
    '/auto-runner/01-growth.png',
    '/auto-runner/02-river.png',
    '/auto-runner/03-terrain.png',
    '/auto-runner/04-fabric.png',
    '/auto-runner/05-sound.png',
];
const ART_ROTATE_MS = 5000;

const HISTORY_CAP = 40;
const SPARK_POINTS = 16;
const SPARK_W = 110;
const SPARK_H = 26;
const SPARK_PAD = 3;

const buildSparkline = (values: number[]) => {
    const pts = values.slice(-SPARK_POINTS);
    if (pts.length === 0) return { line: '', dot: { x: SPARK_PAD, y: SPARK_H / 2 } };
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = Math.max(1, max - min);
    const coords = pts.map((v, i) => {
        const x = SPARK_PAD + (i / Math.max(1, pts.length - 1)) * (SPARK_W - SPARK_PAD * 2);
        const y = SPARK_H - SPARK_PAD - ((v - min) / span) * (SPARK_H - SPARK_PAD * 2);
        return `${x},${y}`;
    });
    const last = coords[coords.length - 1].split(',').map(Number);
    return { line: coords.join(' '), dot: { x: last[0], y: last[1] } };
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

    // --- count-up animation for the running total -------------------------
    const [displayedTotal, setDisplayedTotal] = useState(cumulative_profit);
    const prevTotalRef = useRef(cumulative_profit);
    const countRafRef = useRef<number>();

    useEffect(() => {
        const to = cumulative_profit;
        const from = prevTotalRef.current;
        prevTotalRef.current = to;
        if (from === to) return undefined;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) {
            setDisplayedTotal(to);
            return undefined;
        }

        const start = performance.now();
        const duration = 650;
        if (countRafRef.current) cancelAnimationFrame(countRafRef.current);

        const frame = (now: number) => {
            const progress = Math.min(1, (now - start) / duration);
            const eased = 1 - (1 - progress) ** 3;
            setDisplayedTotal(from + (to - from) * eased);
            if (progress < 1) countRafRef.current = requestAnimationFrame(frame);
        };
        countRafRef.current = requestAnimationFrame(frame);
        return () => {
            if (countRafRef.current) cancelAnimationFrame(countRafRef.current);
        };
    }, [cumulative_profit]);

    // --- sparkline history --------------------------------------------------
    const [history, setHistory] = useState<number[]>([cumulative_profit]);
    useEffect(() => {
        setHistory(prev => {
            if (prev.length && prev[prev.length - 1] === cumulative_profit) return prev;
            const next = [...prev, cumulative_profit];
            return next.length > HISTORY_CAP ? next.slice(-HISTORY_CAP) : next;
        });
    }, [cumulative_profit]);
    const spark = buildSparkline(history);

    // --- toast on real status transitions -----------------------------------
    const [toast, setToast] = useState<{ text: string; kind: 'pos' | 'neg' | '' } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const showToast = useCallback((text: string, kind: 'pos' | 'neg' | '' = '') => {
        setToast({ text, kind });
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 2600);
    }, []);
    useEffect(() => () => clearTimeout(toastTimerRef.current), []);

    const prevStatusRef = useRef(store.status);
    useEffect(() => {
        const prev = prevStatusRef.current;
        prevStatusRef.current = store.status;
        if (prev === store.status) return;
        if (store.status === 'running') showToast('Auto-Runner started');
        else if (store.status === 'stopped_target') showToast('Target reached — session stopped', 'pos');
        else if (store.status === 'stopped_loss') showToast('Loss limit reached — session stopped', 'neg');
        else if (store.status === 'stopped_manual' && prev === 'running') showToast('Stopped manually');
        else if (store.status === 'error') showToast('Auto-Runner needs attention', 'neg');
    }, [store.status, showToast]);

    // --- rotating background art, crossfades between two always-mounted layers
    const [slotImages, setSlotImages] = useState<[string, string]>([ART_IMAGES[0], ART_IMAGES[0]]);
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const activeSlotRef = useRef<0 | 1>(0);

    useEffect(() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) return undefined;
        let index = 0;
        const id = setInterval(() => {
            index = (index + 1) % ART_IMAGES.length;
            const nextSlot = activeSlotRef.current === 0 ? 1 : 0;
            setSlotImages(prev => {
                const next: [string, string] = [...prev] as [string, string];
                next[nextSlot] = ART_IMAGES[index];
                return next;
            });
            requestAnimationFrame(() => {
                activeSlotRef.current = nextSlot;
                setActiveSlot(nextSlot);
            });
        }, ART_ROTATE_MS);
        return () => clearInterval(id);
    }, []);

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

            <div className='vx-autorun__photopanel'>
                <div
                    className={`vx-autorun__art-layer${activeSlot === 0 ? ' is-active' : ''}`}
                    style={{ backgroundImage: `url(${slotImages[0]})` }}
                    aria-hidden='true'
                />
                <div
                    className={`vx-autorun__art-layer${activeSlot === 1 ? ' is-active' : ''}`}
                    style={{ backgroundImage: `url(${slotImages[1]})` }}
                    aria-hidden='true'
                />

                <div className='vx-autorun__chip vx-autorun__chip--brand'>
                    <span className='vx-autorun__chip-nm'>Auto-Runner</span>
                </div>
                <div className={`vx-autorun__chip vx-autorun__chip--status${store.status !== 'running' ? ' is-stopped' : ''}`}>
                    <span className={`vx-autorun__chip-dot${store.status === 'running' ? ' pulse' : ''}`} />
                    <span>{STATUS_LABEL[store.status]}</span>
                </div>

                <div className='vx-autorun__chip vx-autorun__stat vx-autorun__stat--target'>
                    <span className='vx-autorun__stat-lbl'>Target</span>
                    <span className='vx-autorun__stat-val is-pos'>+{target ? target.toFixed(2) : '—'}</span>
                </div>

                <div className='vx-autorun__chip vx-autorun__stat vx-autorun__stat--current'>
                    <span className='vx-autorun__stat-lbl'>Today&rsquo;s total</span>
                    <span className={`vx-autorun__stat-val vx-autorun__stat-val--lg ${displayedTotal >= 0 ? 'is-pos' : 'is-neg'}`}>
                        {displayedTotal >= 0 ? '+' : ''}
                        {displayedTotal.toFixed(2)} {currency}
                    </span>
                    <svg className='vx-autorun__spark' width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} aria-hidden='true'>
                        <polyline
                            points={spark.line}
                            className={history[history.length - 1] >= 0 ? 'is-pos' : 'is-neg'}
                        />
                        <circle
                            cx={spark.dot.x}
                            cy={spark.dot.y}
                            r={2.2}
                            className={history[history.length - 1] >= 0 ? 'is-pos' : 'is-neg'}
                        />
                    </svg>
                </div>

                <div className='vx-autorun__chip vx-autorun__stat vx-autorun__stat--loss'>
                    <span className='vx-autorun__stat-lbl'>Loss limit</span>
                    <span className='vx-autorun__stat-val is-neg'>&minus;{limit ? limit.toFixed(2) : '—'}</span>
                </div>

                {toast && <div className={`vx-autorun__toast is-visible ${toast.kind}`}>{toast.text}</div>}

                <div className='vx-autorun__bar'>
                    <span className='vx-autorun__bar-cycles'>
                        <b>{cycles_completed}</b> cycle{cycles_completed === 1 ? '' : 's'} today
                    </span>

                    <label className='vx-autorun__field'>
                        <span>Target</span>
                        <input
                            type='number'
                            min='0'
                            step='0.01'
                            placeholder='0 = off'
                            value={profitInput}
                            disabled={store.is_active}
                            onChange={e => setProfitInput(e.target.value)}
                        />
                    </label>
                    <label className='vx-autorun__field'>
                        <span>Loss limit</span>
                        <input
                            type='number'
                            min='0'
                            step='0.01'
                            placeholder='0 = off'
                            value={lossInput}
                            disabled={store.is_active}
                            onChange={e => setLossInput(e.target.value)}
                        />
                    </label>

                    <button
                        type='button'
                        className={`vx-autorun__toggle ${store.sound_on ? 'is-on' : ''}`}
                        onClick={() => store.setSoundOn(!store.sound_on)}
                    >
                        <span className='vx-autorun__toggle-dot' />
                        Chime
                    </button>
                    <button
                        type='button'
                        className={`vx-autorun__toggle ${store.voice_on ? 'is-on' : ''}`}
                        onClick={() => store.setVoiceOn(!store.voice_on)}
                    >
                        <span className='vx-autorun__toggle-dot' />
                        Voice
                    </button>

                    <span className='vx-autorun__bar-spacer' />

                    {store.is_active ? (
                        <button type='button' className='vx-autorun__btn vx-autorun__btn--stop' onClick={store.stop}>
                            Stop
                        </button>
                    ) : (
                        <button type='button' className='vx-autorun__btn vx-autorun__btn--run' onClick={handleStart}>
                            Run
                        </button>
                    )}
                </div>
            </div>

            {!store.is_active && (
                <p className='vx-autorun__hint'>
                    Load your strategy in Bot Builder first. Auto-Runner presses the same Run button — it can&rsquo;t
                    start without a strategy loaded there.
                </p>
            )}

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
                that as the end of a cycle and restart — use &ldquo;Stop&rdquo; above for a clean stop.
            </p>
        </div>
    );
});

export default AutoRunner;
