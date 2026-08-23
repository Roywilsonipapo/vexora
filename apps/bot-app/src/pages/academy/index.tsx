import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPayoutRatio } from '../market-analysis/fetch-payout';
import type { TContract } from '../market-analysis/backtest-engine';
import { ACADEMY, TOTAL_LESSONS, TOTAL_MINUTES } from './academy-content';
import './academy.scss';

/**
 * Vexora Academy.
 *
 * Course content plus a live edge table. The table is the part that does not
 * exist anywhere else: it puts Deriv's real current payout next to the exact
 * break-even payout, so the house edge on every contract is visible rather
 * than implied.
 *
 * Payouts are fetched, never assumed. Without a live figure the table shows
 * the probability and break-even (both exact) and says the payout is
 * unavailable — a made-up payout would teach a false edge.
 */

const STORAGE_KEY = 'vx_academy_done';

// Exact, from counting digits — not estimates.
const EDGE_ROWS: { label: string; contract: TContract; barrier: number; p: number }[] = [
    { label: 'Over 1', contract: 'DIGITOVER', barrier: 1, p: 0.8 },
    { label: 'Over 2', contract: 'DIGITOVER', barrier: 2, p: 0.7 },
    { label: 'Over 4', contract: 'DIGITOVER', barrier: 4, p: 0.5 },
    { label: 'Under 8', contract: 'DIGITUNDER', barrier: 8, p: 0.8 },
    { label: 'Even', contract: 'DIGITEVEN', barrier: 0, p: 0.5 },
    { label: 'Odd', contract: 'DIGITODD', barrier: 0, p: 0.5 },
    { label: 'Differs 5', contract: 'DIGITDIFF', barrier: 5, p: 0.9 },
    { label: 'Matches 5', contract: 'DIGITMATCH', barrier: 5, p: 0.1 },
];

type TEdgeRow = { label: string; p: number; breakeven: number; payout: number | null; edge: number | null };

const readDone = (): string[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

const Academy = () => {
    const [done, setDone] = useState<string[]>(readDone);
    const [open, setOpen] = useState<string | null>(ACADEMY[0]?.lessons[0]?.id ?? null);
    // Seeded from the exact maths so the table is useful immediately. Probability
    // and break-even need no network — only the payout column waits.
    const [edge, setEdge] = useState<TEdgeRow[]>(() =>
        EDGE_ROWS.map(r => ({
            label: r.label,
            p: r.p,
            breakeven: +(1 / r.p).toFixed(3),
            payout: null,
            edge: null,
        }))
    );
    const [edgeState, setEdgeState] = useState<'idle' | 'loading' | 'done' | 'unavailable'>('idle');

    const toggleDone = useCallback((id: string) => {
        setDone(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                /* storage blocked — progress just won't persist */
            }
            return next;
        });
    }, []);

    const loadEdge = useCallback(async () => {
        setEdgeState('loading');
        // In parallel, not sequentially: eight contracts each waiting on their
        // own timeout took close to a minute in series, so the table sat empty.
        const priced = await Promise.all(
            EDGE_ROWS.map(r => fetchPayoutRatio('R_100', r.contract, r.barrier))
        );
        const rows: TEdgeRow[] = EDGE_ROWS.map((r, i) => {
            const res = priced[i];
            const payout = 'ratio' in res ? res.ratio : null;
            return {
                label: r.label,
                p: r.p,
                breakeven: +(1 / r.p).toFixed(3),
                payout,
                // Expected value per 1 staked: p x payout - 1. Negative is the
                // house edge, expressed as a percentage of stake.
                edge: payout === null ? null : +((r.p * payout - 1) * 100).toFixed(2),
            };
        });
        setEdge(rows);
        setEdgeState(rows.some(r => r.payout !== null) ? 'done' : 'unavailable');
    }, []);

    useEffect(() => {
        loadEdge();
    }, [loadEdge]);

    const pct = useMemo(() => Math.round((done.length / TOTAL_LESSONS) * 100), [done.length]);

    return (
        <div className='vx-academy'>
            <div className='vx-academy__head'>
                <div>
                    <h2>Vexora Academy</h2>
                    <p>
                        {TOTAL_LESSONS} lessons, about {TOTAL_MINUTES} minutes. Everything here is exact maths or
                        measured data — no claimed edges.
                    </p>
                </div>
                <div className='vx-academy__progress'>
                    <div className='vx-academy__bar'>
                        <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className='vx-academy__pcount'>
                        {done.length} / {TOTAL_LESSONS} complete
                    </span>
                </div>
            </div>

            <section className='vx-card vx-academy__edge'>
                <div className='vx-academy__edgehead'>
                    <h3>Live edge table</h3>
                    <button type='button' onClick={loadEdge} disabled={edgeState === 'loading'}>
                        {edgeState === 'loading' ? 'Pricing…' : 'Refresh'}
                    </button>
                </div>
                <p className='vx-academy__edgelede'>
                    Break-even payout is 1 ÷ probability — the payout at which you would come out flat. Deriv pays a
                    little less. That gap is the house edge, per trade, on your stake.
                </p>

                {edgeState === 'unavailable' && (
                    <p className='vx-academy__warn'>
                        Live payouts need a logged-in session. Probability and break-even below are exact regardless;
                        the payout column stays empty rather than showing a guessed number.
                    </p>
                )}

                <div className='vx-academy__tablewrap'>
                    <table>
                        <thead>
                            <tr>
                                <th>Contract</th>
                                <th>Win chance</th>
                                <th>Break-even</th>
                                <th>Deriv pays</th>
                                <th>Edge per trade</th>
                            </tr>
                        </thead>
                        <tbody>
                            {edge.map(r => (
                                <tr key={r.label}>
                                    <td>{r.label}</td>
                                    <td>{(r.p * 100).toFixed(0)}%</td>
                                    <td>{r.breakeven.toFixed(3)}x</td>
                                    <td>{r.payout === null ? '—' : `${r.payout.toFixed(3)}x`}</td>
                                    <td className={r.edge !== null && r.edge < 0 ? 'is-neg' : ''}>
                                        {r.edge === null ? '—' : `${r.edge > 0 ? '+' : ''}${r.edge}%`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {ACADEMY.map(mod => (
                <section key={mod.id} className='vx-academy__module'>
                    <div className='vx-academy__modhead'>
                        <h3>{mod.title}</h3>
                        <span>{mod.subtitle}</span>
                    </div>

                    {mod.lessons.map(lesson => {
                        const is_open = open === lesson.id;
                        const is_done = done.includes(lesson.id);
                        return (
                            <article
                                key={lesson.id}
                                className={`vx-card vx-lesson${is_open ? ' is-open' : ''}${is_done ? ' is-done' : ''}`}
                            >
                                <button
                                    type='button'
                                    className='vx-lesson__head'
                                    onClick={() => setOpen(is_open ? null : lesson.id)}
                                    aria-expanded={is_open}
                                >
                                    <span className='vx-lesson__tick' aria-hidden='true'>
                                        {is_done ? '✓' : ''}
                                    </span>
                                    <span className='vx-lesson__titles'>
                                        <span className='vx-lesson__title'>{lesson.title}</span>
                                        <span className='vx-lesson__summary'>{lesson.summary}</span>
                                    </span>
                                    <span className='vx-lesson__mins'>{lesson.minutes} min</span>
                                </button>

                                {is_open && (
                                    <div className='vx-lesson__body'>
                                        {lesson.body.map((para, i) => (
                                            <p key={i}>{para}</p>
                                        ))}

                                        {lesson.table && (
                                            <div className='vx-academy__tablewrap'>
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            {lesson.table.head.map(h => (
                                                                <th key={h}>{h}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {lesson.table.rows.map((row, i) => (
                                                            <tr key={i}>
                                                                {row.map((cell, j) => (
                                                                    <td key={j}>{cell}</td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        <p className='vx-lesson__takeaway'>
                                            <strong>Takeaway.</strong> {lesson.takeaway}
                                        </p>

                                        <button
                                            type='button'
                                            className='vx-lesson__done'
                                            onClick={() => toggleDone(lesson.id)}
                                        >
                                            {is_done ? 'Mark as not done' : 'Mark complete'}
                                        </button>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </section>
            ))}
        </div>
    );
};

export default Academy;
