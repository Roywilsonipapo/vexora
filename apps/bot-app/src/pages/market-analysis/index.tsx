import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import './market-analysis.scss';

type TTickHistoryResponse = {
    history?: { prices: string[]; times: number[] };
    error?: { message: string };
};

const SYMBOLS = [
    { code: 'R_10', label: 'Volatility 10 Index' },
    { code: 'R_25', label: 'Volatility 25 Index' },
    { code: 'R_50', label: 'Volatility 50 Index' },
    { code: 'R_75', label: 'Volatility 75 Index' },
    { code: 'R_100', label: 'Volatility 100 Index' },
];

const TICK_COUNT = 200;

const lastDigit = (price: string) => {
    if (typeof price !== 'string' || price.length === 0) return 0;
    const n = Number(price.charAt(price.length - 1));
    return Number.isNaN(n) ? 0 : n;
};

const computeStdDev = (values: number[]) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
};

const waitForApi = async (timeoutMs = 6000): Promise<boolean> => {
    const start = Date.now();
    while (!api_base?.api) {
        if (Date.now() - start > timeoutMs) return false;
        await new Promise(r => setTimeout(r, 200));
    }
    return true;
};

const fetchTickHistory = async (symbol: string): Promise<string[] | null> => {
    const ready = await waitForApi();
    if (!ready || !api_base?.api) return null;
    try {
        const response: TTickHistoryResponse = await api_base.api.send({
            ticks_history: symbol,
            count: TICK_COUNT,
            end: 'latest',
            style: 'ticks',
        });
        if (response?.error) return null;
        return response?.history?.prices ?? null;
    } catch {
        return null;
    }
};

const MarketAnalysis = observer(() => {
    const { run_panel } = useStore();
    const is_bot_running = Boolean(run_panel?.is_running);
    const [symbol, setSymbol] = useState('R_100');
    const [prices, setPrices] = useState<string[]>([]);
    const [barrier, setBarrier] = useState(5);
    const [matchDigit, setMatchDigit] = useState(2);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scanRows, setScanRows] = useState<{ code: string; label: string; volatility: number; trend: 'up' | 'down' | 'flat' }[]>([]);
    const [isScanning, setIsScanning] = useState(true);
    const [view, setView] = useState<'circles' | 'scanner'>('circles');

    // Load tick history for the selected symbol and keep a live subscription running.
    useEffect(() => {
        let is_mounted = true;
        setIsLoading(true);
        setError(null);

        (async () => {
            const history = await fetchTickHistory(symbol);
            if (!is_mounted) return;
            if (!history) {
                setError('Could not load live data from Deriv right now. Please try again shortly.');
                setIsLoading(false);
                return;
            }
            setPrices(history);
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
                        if (is_mounted) setError('Could not subscribe to live prices right now.');
                    });

                if (typeof api_base.api.onMessage === 'function') {
                    message_subscription = api_base.api.onMessage().subscribe(
                        (payload: { data?: { msg_type: string; tick?: { symbol: string; quote: number } } }) => {
                            try {
                                const data = payload?.data;
                                if (!is_mounted || !data) return;
                                if (data.msg_type === 'tick' && data.tick && data.tick.symbol === symbol) {
                                    const quote = data.tick.quote;
                                    setPrices(prev => [...prev.slice(-(TICK_COUNT - 1)), String(quote)]);
                                }
                            } catch {
                                // Never let a malformed tick payload crash the tab.
                            }
                        }
                    );
                }
            } catch {
                if (is_mounted) setError('Could not subscribe to live prices right now.');
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
    }, [symbol, is_bot_running]);

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
                    if (!history || history.length < 10) return { ...s, volatility: 0, trend: 'flat' as const };
                    const nums = history.map(Number);
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
    prices.forEach(p => digitCounts[lastDigit(p)]++);
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
    const lastTickDigit = prices.length ? lastDigit(prices[prices.length - 1]) : null;

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
            {error && <div className='vx-analysis__status vx-analysis__status--error'>{error}</div>}
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
                            <h3>Over / Under</h3>
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
                        </div>

                        <div className='vx-mini-panel'>
                            <h3>Match / Differ</h3>
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
                        </div>

                        <div className='vx-mini-panel'>
                            <h3>Even / Odd</h3>
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
                        </div>

                        <div className='vx-mini-panel'>
                            <h3>Rise / Fall</h3>
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
                    )}
                </>
            )}
        </div>
    );
});

export default MarketAnalysis;
