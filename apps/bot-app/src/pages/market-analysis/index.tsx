import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import SignalScanner from './signal-scanner';
import { computeStdDev, fetchTickHistory, lastDigit, SYMBOLS, TICK_COUNT, waitForApi } from './tick-utils';
import './market-analysis.scss';

const MarketAnalysis = observer(() => {
    const { run_panel } = useStore();
    const is_bot_running = Boolean(run_panel?.is_running);
    const [symbol, setSymbol] = useState('R_100');
    const [prices, setPrices] = useState<string[]>([]);
    const [pipSize, setPipSize] = useState(2);
    const [barrier, setBarrier] = useState(5);
    const [matchDigit, setMatchDigit] = useState(2);
    const [isLoading, setIsLoading] = useState(true);
    // `error` is fatal (no tick history at all → nothing to analyse).
    // `liveError` is not: history loaded fine, only the live feed is down, so
    // the analysis below stays on screen with a staleness warning instead of
    // the whole tab blanking out.
    const [error, setError] = useState<string | null>(null);
    const [liveError, setLiveError] = useState<string | null>(null);
    const [scanRows, setScanRows] = useState<{ code: string; label: string; volatility: number; trend: 'up' | 'down' | 'flat' }[]>([]);
    const [isScanning, setIsScanning] = useState(true);
    const [view, setView] = useState<'circles' | 'scanner'>('circles');
    // Which panels have their history chip row expanded past the first 10.
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    // Bumped by the Retry button to re-run the data-loading effect.
    const [reloadKey, setReloadKey] = useState(0);

    // Load tick history for the selected symbol and keep a live subscription running.
    useEffect(() => {
        let is_mounted = true;
        setIsLoading(true);
        setError(null);
        setLiveError(null);

        (async () => {
            // On a cold page load the socket often isn't open yet — waitForApi
            // only proves `api_base.api` exists, not that it's connected. A
            // single attempt therefore loses the race and left the tab stuck on
            // a permanent error. Retry with backoff before giving up.
            let history = null;
            for (let attempt = 0; attempt < 4 && is_mounted && !history; attempt++) {
                if (attempt > 0) await new Promise(r => setTimeout(r, 700 * attempt));
                history = await fetchTickHistory(symbol);
            }
            if (!is_mounted) return;
            if (!history) {
                setError('Could not load live data from Deriv right now. Please try again shortly.');
                setIsLoading(false);
                return;
            }
            setPrices(history.prices);
            setPipSize(history.pip_size);
            setIsLoading(false);
        })();

        let message_subscription: { unsubscribe: () => void } | null = null;
        let tick_subscription_id: string | null = null;

        (async () => {
            const ready = await waitForApi();
            if (!ready || !is_mounted || !api_base?.api || is_bot_running) return;

            try {
                api_base.api
                    .send({ ticks: symbol, subscribe: 1 })
                    .then((res: { subscription?: { id: string } }) => {
                        if (res?.subscription?.id) tick_subscription_id = res.subscription.id;
                    })
                    .catch(() => {
                        if (is_mounted) setLiveError('Live price updates are unavailable — showing the latest history.');
                    });

                if (typeof api_base.api.onMessage === 'function') {
                    message_subscription = api_base.api.onMessage().subscribe(
                        (payload: {
                            data?: { msg_type: string; tick?: { symbol: string; quote: number; pip_size?: number } };
                        }) => {
                            try {
                                const data = payload?.data;
                                if (!is_mounted || !data) return;
                                if (data.msg_type === 'tick' && data.tick && data.tick.symbol === symbol) {
                                    const quote = data.tick.quote;
                                    if (typeof data.tick.pip_size === 'number') setPipSize(data.tick.pip_size);
                                    setPrices(prev => [...prev.slice(-(TICK_COUNT - 1)), String(quote)]);
                                }
                            } catch {
                                // Never let a malformed tick payload crash the tab.
                            }
                        }
                    );
                }
            } catch {
                if (is_mounted) setLiveError('Live price updates are unavailable — showing the latest history.');
            }
        })();

        return () => {
            is_mounted = false;
            try {
                message_subscription?.unsubscribe();
            } catch {
                // ignore
            }
            if (tick_subscription_id && api_base?.api && typeof api_base.api.forget === 'function') {
                api_base.api.forget(tick_subscription_id).catch(() => {});
            }
        };
    }, [symbol, is_bot_running, reloadKey]);

    // Live multi-symbol scan for the volatility ranking table.
    // Skipped entirely while a bot is running — this does 5 extra history
    // fetches every 30s, which competes with your bot's own trade requests
    // on the same connection. Not worth it while a bot actually needs that
    // bandwidth.
    useEffect(() => {
        if (is_bot_running) {
            setScanRows([]);
            return;
        }
        let is_mounted = true;
        const runScan = async () => {
            setIsScanning(true);
            const results = await Promise.all(
                SYMBOLS.map(async s => {
                    const history = await fetchTickHistory(s.code);
                    if (!history || history.prices.length < 10)
                        return { ...s, volatility: 0, trend: 'flat' as const };
                    const nums = history.prices.map(Number);
                    const returns = nums.slice(1).map((p, i) => (p - nums[i]) / nums[i]);
                    const volatility = computeStdDev(returns) * 10000; // scaled for readability
                    const shortMa = nums.slice(-10).reduce((a, b) => a + b, 0) / 10;
                    const longMa = nums.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, nums.length);
                    const trend: 'up' | 'down' | 'flat' =
                        shortMa > longMa * 1.0001 ? 'up' : shortMa < longMa * 0.9999 ? 'down' : 'flat';
                    return { ...s, volatility, trend };
                })
            );
            if (!is_mounted) return;
            results.sort((a, b) => b.volatility - a.volatility);
            setScanRows(results);
            setIsScanning(false);
        };
        runScan();
        const interval = setInterval(runScan, 30000);
        return () => {
            is_mounted = false;
            clearInterval(interval);
        };
    }, [is_bot_running]);

    const digitCounts = Array(10).fill(0);
    prices.forEach(p => digitCounts[lastDigit(p, pipSize)]++);
    const total = prices.length || 1;
    const digitPct = digitCounts.map(c => (c / total) * 100);
    const maxDigit = digitPct.indexOf(Math.max(...digitPct));
    const minDigit = digitPct.indexOf(Math.min(...digitPct));

    const overPct = digitCounts.slice(barrier + 1).reduce((a, b) => a + b, 0) / total * 100;
    const underPct = digitCounts.slice(0, barrier).reduce((a, b) => a + b, 0) / total * 100;
    const evenPct = (digitCounts[0] + digitCounts[2] + digitCounts[4] + digitCounts[6] + digitCounts[8]) / total * 100;
    const oddPct = 100 - evenPct;
    const matchPct = digitPct[matchDigit] ?? 0;
    const differPct = 100 - matchPct;
    const lastTickDigit = prices.length ? lastDigit(prices[prices.length - 1], pipSize) : null;

    const nums = prices.map(Number);
    const returns = nums.slice(1).map((p, i) => (p - nums[i]) / nums[i]);
    const volatility = computeStdDev(returns) * 10000;

    // Tick-to-tick rise/fall split — flat (equal) ticks aren't counted in either bucket.
    let riseCount = 0;
    let fallCount = 0;
    for (let i = 1; i < nums.length; i++) {
        if (nums[i] > nums[i - 1]) riseCount++;
        else if (nums[i] < nums[i - 1]) fallCount++;
    }
    const riseTotal = riseCount + fallCount || 1;
    const risePct = (riseCount / riseTotal) * 100;
    const fallPct = 100 - risePct;

    // --- Outcome sequences, streaks and history chips ---------------------
    // Each sequence is the real per-tick outcome for that contract type, in
    // chronological order. `null` means the tick counts for neither side
    // (a digit equal to the Over/Under barrier, or a flat tick on Rise/Fall).
    const digitSeq = prices.map(p => lastDigit(p, pipSize));
    const overUnderSeq = digitSeq.map(d => (d > barrier ? 'O' : d < barrier ? 'U' : null));
    const matchDifferSeq = digitSeq.map(d => (d === matchDigit ? 'M' : 'D'));
    const evenOddSeq = digitSeq.map(d => (d % 2 === 0 ? 'E' : 'O'));
    const riseFallSeq = nums.map((p, i) => (i === 0 ? null : p > nums[i - 1] ? 'R' : p < nums[i - 1] ? 'F' : null));

    // Length of the current run of identical outcomes at the end of a sequence.
    const trailingStreak = (seq: (string | null)[]) => {
        const clean = seq.filter((v): v is string => v !== null);
        if (!clean.length) return null;
        const value = clean[clean.length - 1];
        let count = 0;
        for (let i = clean.length - 1; i >= 0 && clean[i] === value; i--) count++;
        return { value, count };
    };

    const STREAK_LABELS: Record<string, string> = {
        O: 'Over',
        U: 'Under',
        M: 'Match',
        D: 'Differ',
        E: 'Even',
        R: 'Rise',
        F: 'Fall',
    };
    // Even/Odd reuses 'O' for Odd, so it needs its own lookup.
    const evenOddLabel = (v: string) => (v === 'E' ? 'Even' : 'Odd');

    const formatStreak = (seq: (string | null)[], labeller: (v: string) => string) => {
        const s = trailingStreak(seq);
        return s ? `${s.count}x ${labeller(s.value)}` : null;
    };

    // A plain-language summary of the numbers already computed above — not a
    // separate prediction model. It just states the same facts in words, and
    // says so explicitly.
    const buildConclusion = () => {
        if (!prices.length) return null;
        const skew = Math.abs(evenPct - oddPct);
        const parts: string[] = [];
        parts.push(
            `Digit ${maxDigit} has come up most often (${digitPct[maxDigit].toFixed(1)}%) and ${minDigit} least (${digitPct[minDigit].toFixed(1)}%) over the last ${prices.length} ticks.`
        );
        parts.push(
            overPct > underPct
                ? `Over ${barrier} has hit more often than Under (${overPct.toFixed(1)}% vs ${underPct.toFixed(1)}%).`
                : `Under ${barrier} has hit more often than Over (${underPct.toFixed(1)}% vs ${overPct.toFixed(1)}%).`
        );
        if (skew > 4) {
            parts.push(evenPct > oddPct ? `Even has been notably more frequent (${evenPct.toFixed(1)}%).` : `Odd has been notably more frequent (${oddPct.toFixed(1)}%).`);
        } else {
            parts.push('Even/Odd has stayed close to an even split.');
        }
        parts.push(
            `Volatility on ${symbol} is currently ${volatility > 8 ? 'elevated' : volatility > 4 ? 'moderate' : 'low'} (${volatility.toFixed(2)}).`
        );
        return parts.join(' ');
    };
    const conclusion = buildConclusion();

    // Most-recent-first row of outcome chips, capped at 10 until expanded.
    const renderChips = (key: string, seq: (string | null)[]) => {
        const clean = seq.filter((v): v is string => v !== null).reverse();
        const is_expanded = !!expanded[key];
        const shown = is_expanded ? clean.slice(0, 60) : clean.slice(0, 10);
        if (!shown.length) return null;
        return (
            <div className='vx-chips'>
                {shown.map((v, i) => (
                    <span className={`vx-chip vx-chip--${v}`} key={`${key}-${i}`}>
                        {v}
                    </span>
                ))}
                {clean.length > 10 && (
                    <button
                        type='button'
                        className='vx-chips__more'
                        onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                        {is_expanded ? '– Less' : '+ More'}
                    </button>
                )}
            </div>
        );
    };


    return (
        <div className='vx-analysis'>
            <div className='vx-analysis__header'>
                <div>
                    <h2>Market Analysis</h2>
                    <p className='vx-analysis__disclaimer'>
                        Live statistics computed from real Deriv tick data — {TICK_COUNT} most recent ticks per symbol.
                        These are descriptive statistics, not predictions: synthetic indices are generated to be
                        statistically random, so past digit or volatility patterns don&apos;t guarantee future results.
                    </p>
                </div>
                <select className='vx-analysis__select' value={symbol} onChange={e => setSymbol(e.target.value)}>
                    {SYMBOLS.map(s => (
                        <option key={s.code} value={s.code}>
                            {s.label}
                        </option>
                    ))}
                </select>
            </div>

            {isLoading && <div className='vx-analysis__status'>Loading live tick data…</div>}
            {error && (
                <div className='vx-analysis__status vx-analysis__status--error'>
                    {error}{' '}
                    <button type='button' className='vx-analysis__retry' onClick={() => setReloadKey(k => k + 1)}>
                        Retry
                    </button>
                </div>
            )}
            {liveError && !error && <div className='vx-analysis__status'>{liveError}</div>}
            {is_bot_running && (
                <div className='vx-analysis__status'>
                    A bot is currently running — live updates here are paused so it gets full priority on the
                    connection. Stop the bot to resume live analysis.
                </div>
            )}

            {!isLoading && !error && (
                <>
                    <div className='vx-analysis__toprow'>
                        <div className='vx-analysis__stat'>
                            <span className='vx-analysis__stat-label'>{SYMBOLS.find(s => s.code === symbol)?.label}</span>
                        </div>
                        <div className='vx-analysis__stat vx-analysis__stat--right'>
                            <span className='vx-analysis__stat-label'>Ticks</span>
                            <span className='vx-analysis__stat-value'>{prices.length}</span>
                        </div>
                        <div className='vx-analysis__stat vx-analysis__stat--right'>
                            <span className='vx-analysis__stat-label'>Live price</span>
                            <span className='vx-analysis__stat-value vx-analysis__stat-value--price'>
                                {prices.length ? Number(prices[prices.length - 1]).toFixed(2) : '—'}
                            </span>
                        </div>
                    </div>

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

                    {view === 'circles' && (
                    <>
                    <div className='vx-card vx-ring-panel'>
                        <div className='vx-ring-row'>
                            {digitPct.map((pct, i) => {
                                const isMost = i === maxDigit;
                                const isLeast = i === minDigit;
                                const isBarrier = i === barrier;
                                const isMatch = i === matchDigit;
                                const isTick = i === lastTickDigit;
                                let ring = 'default';
                                if (isMost) ring = 'most';
                                else if (isLeast) ring = 'least';
                                else if (isBarrier) ring = 'barrier';
                                else if (isMatch) ring = 'match';
                                else if (isTick) ring = 'tick';
                                return (
                                    <div className={`vx-ring vx-ring--${ring}`} key={i}>
                                        <span className='vx-ring__digit'>{i}</span>
                                        <span className='vx-ring__pct'>{pct.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className='vx-ring-legend'>
                            <span className='vx-ring-legend__item vx-ring-legend__item--most'>Most frequent</span>
                            <span className='vx-ring-legend__item vx-ring-legend__item--least'>Least frequent</span>
                            <span className='vx-ring-legend__item vx-ring-legend__item--barrier'>Over/Under barrier</span>
                            <span className='vx-ring-legend__item vx-ring-legend__item--match'>Match digit</span>
                            <span className='vx-ring-legend__item vx-ring-legend__item--tick'>Current tick</span>
                        </div>
                    </div>

                    <div className='vx-panel-grid'>
                        <div className='vx-mini-panel'>
                            <div className='vx-mini-panel__head'>
                                <h3>Over / Under</h3>
                                <span className='vx-streak vx-streak--over'>
                                    {formatStreak(overUnderSeq, v => STREAK_LABELS[v])}
                                </span>
                            </div>
                            <div className='vx-digit-select'>
                                {Array.from({ length: 10 }, (_, n) => (
                                    <button
                                        key={n}
                                        type='button'
                                        className={n === barrier ? 'is-active' : ''}
                                        onClick={() => setBarrier(n)}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--over'>Over</span>
                                    <span>{overPct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--over' style={{ width: `${overPct}%` }} />
                                </div>
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--under'>Under</span>
                                    <span>{underPct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--under' style={{ width: `${underPct}%` }} />
                                </div>
                            </div>
                            {renderChips('ou', overUnderSeq)}
                        </div>

                        <div className='vx-mini-panel'>
                            <div className='vx-mini-panel__head'>
                                <h3>Match / Differ</h3>
                                <span className='vx-streak vx-streak--match'>
                                    {formatStreak(matchDifferSeq, v => STREAK_LABELS[v])}
                                </span>
                            </div>
                            <div className='vx-digit-select'>
                                {Array.from({ length: 10 }, (_, n) => (
                                    <button
                                        key={n}
                                        type='button'
                                        className={n === matchDigit ? 'is-active' : ''}
                                        onClick={() => setMatchDigit(n)}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--match'>Match</span>
                                    <span>{matchPct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--match' style={{ width: `${matchPct}%` }} />
                                </div>
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--differ'>Differ</span>
                                    <span>{differPct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--differ' style={{ width: `${differPct}%` }} />
                                </div>
                            </div>
                            {renderChips('md', matchDifferSeq)}
                        </div>

                        <div className='vx-mini-panel'>
                            <div className='vx-mini-panel__head'>
                                <h3>Even / Odd</h3>
                                <span className='vx-streak vx-streak--odd'>
                                    {formatStreak(evenOddSeq, evenOddLabel)}
                                </span>
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--over'>Even</span>
                                    <span>{evenPct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--over' style={{ width: `${evenPct}%` }} />
                                </div>
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--under'>Odd</span>
                                    <span>{oddPct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--under' style={{ width: `${oddPct}%` }} />
                                </div>
                            </div>
                            {renderChips('eo', evenOddSeq)}
                        </div>

                        <div className='vx-mini-panel'>
                            <div className='vx-mini-panel__head'>
                                <h3>Rise / Fall</h3>
                                <span className='vx-streak vx-streak--fall'>
                                    {formatStreak(riseFallSeq, v => STREAK_LABELS[v])}
                                </span>
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--over'>Rise</span>
                                    <span>{risePct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--over' style={{ width: `${risePct}%` }} />
                                </div>
                            </div>
                            <div className='vx-bar'>
                                <div className='vx-bar__head'>
                                    <span className='vx-bar__label vx-bar__label--least'>Fall</span>
                                    <span>{fallPct.toFixed(1)}%</span>
                                </div>
                                <div className='vx-bar__track'>
                                    <div className='vx-bar__fill vx-bar__fill--least' style={{ width: `${fallPct}%` }} />
                                </div>
                            </div>
                            {renderChips('rf', riseFallSeq)}
                        </div>
                    </div>

                    <div className='vx-analysis__grid vx-analysis__grid--single'>
                        <div className='vx-card'>
                            <h3>Volatility</h3>
                            <div className='vx-volatility-value'>{volatility.toFixed(2)}</div>
                            <p className='vx-card__note'>
                                Standard deviation of tick-to-tick returns on {symbol}, scaled ×10,000 for readability.
                                Higher = larger, faster price swings right now.
                            </p>
                        </div>
                    </div>

                    {conclusion && (
                        <div className='vx-card vx-conclusion'>
                            <h3>Right now, in plain terms</h3>
                            <p>{conclusion}</p>
                            <p className='vx-card__note'>
                                This restates the numbers above in words — it&apos;s not a separate prediction, and
                                past frequency on a synthetic index doesn&apos;t change the odds of the next tick.
                            </p>
                            <a
                                className='vx-conclusion__trade-link'
                                href='https://vexora-three.vercel.app'
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                Trade Digits on {symbol} →
                            </a>
                        </div>
                    )}
                    </>
                    )}

                    {view === 'scanner' && (
                    <>
                    <SignalScanner />
                    <div className='vx-card vx-scanner'>
                        <h3>Live volatility scanner</h3>
                        <p className='vx-card__note'>
                            Ranks all five indices by their current real volatility — refreshes every 30 seconds. This
                            is a live statistical ranking, not an AI prediction: it tells you what&apos;s moving fastest
                            right now, not what will win next.
                        </p>
                        {isScanning && scanRows.length === 0 ? (
                            <div className='vx-analysis__status'>Scanning live markets…</div>
                        ) : (
                            <table className='vx-scan-table'>
                                <thead>
                                    <tr>
                                        <th>Symbol</th>
                                        <th>Volatility</th>
                                        <th>Trend</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scanRows.map((row, i) => (
                                        <tr key={row.code} className={i === 0 ? 'is-top' : ''}>
                                            <td>{row.label}</td>
                                            <td>{row.volatility.toFixed(2)}</td>
                                            <td className={`trend-${row.trend}`}>
                                                {row.trend === 'up' ? '▲ Up' : row.trend === 'down' ? '▼ Down' : '— Flat'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    </>
                    )}
                </>
            )}
        </div>
    );
});

export default MarketAnalysis;
