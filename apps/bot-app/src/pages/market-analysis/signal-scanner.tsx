import React, { useEffect, useRef, useState } from 'react';
import { digitCountsFor, fetchTickHistory, SYMBOLS, TICK_COUNT } from './tick-utils';

/**
 * Signal Scanner.
 *
 * Scans every synthetic index for the selected contract type and ranks them by
 * how far the observed outcome is from the theoretical baseline (10% per digit,
 * 50/50 for the binary splits). Every number shown is computed from real Deriv
 * tick history fetched at scan time — nothing here is simulated.
 *
 * Deliberate wording note: results are labelled "observed frequency over N
 * ticks", never "accuracy" or "prediction". Synthetic indices are generated to
 * be statistically random per tick, so a digit that has come up more often does
 * NOT have a better chance of coming up next. The scanner reports what HAS
 * happened; it does not forecast.
 */

type TStrategy = 'matches_differs' | 'even_odd' | 'over_under' | 'rise_fall';

const STRATEGIES: { value: TStrategy; label: string }[] = [
    { value: 'matches_differs', label: 'Matches & Differs' },
    { value: 'even_odd', label: 'Even / Odd' },
    { value: 'over_under', label: 'Over / Under' },
    { value: 'rise_fall', label: 'Rise / Fall' },
];

type TFinding = {
    code: string;
    label: string;
    headline: string;
    detail: string;
    // Percentage-point distance from the random baseline. Higher = more skewed
    // in the sample; explicitly NOT a confidence or win-rate figure.
    skew: number;
};

const analyseSymbol = (
    strategy: TStrategy,
    sym: { code: string; label: string },
    prices: string[],
    pip_size: number
): TFinding | null => {
    const n = prices.length;
    if (n < 20) return null;
    const counts = digitCountsFor(prices, pip_size);
    const pct = counts.map(c => (c / n) * 100);

    if (strategy === 'matches_differs') {
        const top = pct.indexOf(Math.max(...pct));
        const low = pct.indexOf(Math.min(...pct));
        return {
            ...sym,
            headline: `MATCHES digit ${top} — ${pct[top].toFixed(2)}% of ${n} ticks`,
            detail: `Least frequent was ${low} at ${pct[low].toFixed(2)}%. Baseline is 10.00% per digit.`,
            skew: Math.abs(pct[top] - 10),
        };
    }

    if (strategy === 'even_odd') {
        const even = counts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
        const evenPct = (even / n) * 100;
        const oddPct = 100 - evenPct;
        const isEven = evenPct >= oddPct;
        return {
            ...sym,
            headline: `${isEven ? 'EVEN' : 'ODD'} — ${(isEven ? evenPct : oddPct).toFixed(2)}% of ${n} ticks`,
            detail: `Split was ${evenPct.toFixed(2)}% even / ${oddPct.toFixed(2)}% odd. Baseline is 50.00%.`,
            skew: Math.abs(evenPct - 50),
        };
    }

    if (strategy === 'over_under') {
        // Pick the barrier with the widest observed over/under split.
        let best = { barrier: 5, overPct: 0, underPct: 0, skew: -1 };
        for (let b = 1; b <= 8; b++) {
            const over = counts.slice(b + 1).reduce((a, c) => a + c, 0);
            const under = counts.slice(0, b).reduce((a, c) => a + c, 0);
            const decided = over + under;
            if (!decided) continue;
            const overPct = (over / decided) * 100;
            const skew = Math.abs(overPct - 50);
            if (skew > best.skew) best = { barrier: b, overPct, underPct: 100 - overPct, skew };
        }
        if (best.skew < 0) return null;
        const isOver = best.overPct >= best.underPct;
        return {
            ...sym,
            headline: `${isOver ? 'OVER' : 'UNDER'} ${best.barrier} — ${(isOver ? best.overPct : best.underPct).toFixed(2)}%`,
            detail: `Widest split of any barrier on this market, over ${n} ticks (ties excluded).`,
            skew: best.skew,
        };
    }

    // rise_fall
    const nums = prices.map(Number);
    let rise = 0;
    let fall = 0;
    for (let i = 1; i < nums.length; i++) {
        if (nums[i] > nums[i - 1]) rise++;
        else if (nums[i] < nums[i - 1]) fall++;
    }
    const decided = rise + fall;
    if (!decided) return null;
    const risePct = (rise / decided) * 100;
    const isRise = risePct >= 50;
    return {
        ...sym,
        headline: `${isRise ? 'RISE' : 'FALL'} — ${(isRise ? risePct : 100 - risePct).toFixed(2)}%`,
        detail: `${rise} rises / ${fall} falls over ${n} ticks (flat ticks excluded). Baseline is 50.00%.`,
        skew: Math.abs(risePct - 50),
    };
};

const SignalScanner = () => {
    const [strategy, setStrategy] = useState<TStrategy>('matches_differs');
    const [market, setMarket] = useState('all');
    const [latestTick, setLatestTick] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [lines, setLines] = useState<string[]>([]);
    const [showTerminal, setShowTerminal] = useState(false);
    const bodyRef = useRef<HTMLDivElement>(null);

    // Latest tick readout on the entry card — polls real history, no socket
    // subscription, so it can't collide with the bot's own tick stream.
    useEffect(() => {
        let alive = true;
        const poll = async () => {
            const code = market === 'all' ? 'R_100' : market;
            const res = await fetchTickHistory(code, 1);
            if (!alive) return;
            if (res?.prices?.length) setLatestTick(Number(res.prices[res.prices.length - 1]).toFixed(res.pip_size));
        };
        poll();
        const id = setInterval(poll, 2000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, [market]);

    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [lines]);

    const push = (line: string) => setLines(prev => [...prev, line]);

    const runScan = async () => {
        setIsRunning(true);
        setShowTerminal(true);
        setLines([]);

        const targets = market === 'all' ? SYMBOLS : SYMBOLS.filter(s => s.code === market);
        const label = STRATEGIES.find(s => s.value === strategy)?.label ?? strategy;

        push(`Scanning ${label} across ${targets.length} market${targets.length > 1 ? 's' : ''}...`);

        const findings: TFinding[] = [];
        for (const sym of targets) {
            push(`Fetching ${TICK_COUNT} ticks — ${sym.label}...`);
            const res = await fetchTickHistory(sym.code);
            if (!res) {
                push(`  ! ${sym.label}: no data returned, skipped.`);
                continue;
            }
            const finding = analyseSymbol(strategy, sym, res.prices, res.pip_size);
            if (!finding) {
                push(`  ! ${sym.label}: not enough usable ticks, skipped.`);
                continue;
            }
            findings.push(finding);
            push(`  ${sym.label}: ${finding.headline}`);
        }

        if (!findings.length) {
            push('');
            push('Scan finished — no market returned usable data. Try again shortly.');
            setIsRunning(false);
            return;
        }

        findings.sort((a, b) => b.skew - a.skew);
        const top = findings[0];

        push('');
        push('--- Scan complete ---');
        push(`Most skewed market: ${top.label}`);
        push(`  ${top.headline}`);
        push(`  ${top.detail}`);
        push(`  Deviation from baseline: ${top.skew.toFixed(2)} percentage points.`);
        push('');
        push('These are observed frequencies over the sampled ticks, not predictions.');
        push('Synthetic indices are random per tick — past digits do not change the');
        push('odds of the next one. Use this to see what has happened, not what will.');
        setIsRunning(false);
    };

    return (
        <div className='vx-scanner-view'>
            <div className='vx-card vx-signal-card'>
                <h3 className='vx-signal-card__title'>Signal Scanner</h3>

                <div className='vx-signal-card__controls'>
                    <label className='vx-signal-field'>
                        <span>Select Strategy</span>
                        <select value={strategy} onChange={e => setStrategy(e.target.value as TStrategy)}>
                            {STRATEGIES.map(s => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className='vx-signal-field'>
                        <span>Select Market</span>
                        <select value={market} onChange={e => setMarket(e.target.value)}>
                            <option value='all'>All markets</option>
                            {SYMBOLS.map(s => (
                                <option key={s.code} value={s.code}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className='vx-signal-tick'>
                    Latest Tick: <strong>{latestTick ?? '—'}</strong>
                    {latestTick && <span className='vx-signal-tick__digit'>{latestTick.slice(-1)}</span>}
                </div>

                <button type='button' className='vx-signal-analyse' onClick={runScan} disabled={isRunning}>
                    {isRunning ? 'Scanning…' : 'Analyse'}
                </button>
            </div>

            {showTerminal && (
                <div className='vx-terminal'>
                    <div className='vx-terminal__bar'>
                        <span className='vx-terminal__dots'>
                            <i className='vx-terminal__dot vx-terminal__dot--r' />
                            <i className='vx-terminal__dot vx-terminal__dot--y' />
                            <i className='vx-terminal__dot vx-terminal__dot--g' />
                        </span>
                        <button
                            type='button'
                            className='vx-terminal__close'
                            onClick={() => setShowTerminal(false)}
                            aria-label='Close scan output'
                        >
                            X
                        </button>
                    </div>
                    <div className='vx-terminal__body' ref={bodyRef}>
                        {lines.map((l, i) => (
                            <div className='vx-terminal__line' key={i}>
                                {l || ' '}
                            </div>
                        ))}
                        {isRunning && <div className='vx-terminal__line vx-terminal__line--cursor'>_</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SignalScanner;
