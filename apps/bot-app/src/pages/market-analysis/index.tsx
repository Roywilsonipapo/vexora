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
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scanRows, setScanRows] = useState<{ code: string; label: string; volatility: number; trend: 'up' | 'down' | 'flat' }[]>([]);
    const [isScanning, setIsScanning] = useState(true);

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

    const nums = prices.map(Number);
    const returns = nums.slice(1).map((p, i) => (p - nums[i]) / nums[i]);
    const volatility = computeStdDev(returns) * 10000;

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
                    <div className='vx-analysis__grid'>
                        <div className='vx-card'>
                            <h3>Last-digit frequency</h3>
                            <div className='vx-digit-bars'>
                                {digitPct.map((pct, i) => (
                                    <div className='vx-digit-bar' key={i}>
                                        <div
                                            className={`vx-digit-bar__fill${i === maxDigit ? ' is-max' : ''}${
                                                i === minDigit ? ' is-min' : ''
                                            }`}
                                            style={{ height: `${Math.max(pct * 4, 3)}px` }}
                                        />
                                        <span className='vx-digit-bar__label'>{i}</span>
                                        <span className='vx-digit-bar__pct'>{pct.toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                            <p className='vx-card__note'>
                                Most frequent: <b>{maxDigit}</b> · Least frequent: <b>{minDigit}</b>
                            </p>
                        </div>

                        <div className='vx-card'>
                            <h3>Over / Under, Even / Odd</h3>
                            <div className='vx-barrier-row'>
                                <label>Barrier</label>
                                <input
                                    type='range'
                                    min={0}
                                    max={9}
                                    value={barrier}
                                    onChange={e => setBarrier(Number(e.target.value))}
                                />
                                <span>{barrier}</span>
                            </div>
                            <div className='vx-stat-row'>
                                <span>Over {barrier}</span>
                                <b>{overPct.toFixed(1)}%</b>
                            </div>
                            <div className='vx-stat-row'>
                                <span>Under {barrier}</span>
                                <b>{underPct.toFixed(1)}%</b>
                            </div>
                            <div className='vx-stat-row'>
                                <span>Even</span>
                                <b>{evenPct.toFixed(1)}%</b>
                            </div>
                            <div className='vx-stat-row'>
                                <span>Odd</span>
                                <b>{oddPct.toFixed(1)}%</b>
                            </div>
                        </div>

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
        </div>
    );
});

export default MarketAnalysis;
