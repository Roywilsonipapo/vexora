import { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'moment';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { isDemoAccount } from '@/utils/account-helpers';
import { fetchMonthProfitTable, TProfitEntry } from './fetch-profit-table';
import './journal.scss';

/**
 * Journal — today's and this month's real profit/loss, in USD and KES.
 *
 * Built on Deriv's own profit_table, not this app's local transactions cache.
 * The first version of this page read transactions_store, and the run
 * panel's Reset button calls transactions.clear() directly — so resetting
 * the run panel silently wiped the Journal too. profit_table lives on
 * Deriv's server; nothing in this app's UI can clear it.
 *
 * Reflects whichever account is currently active, labelled, and refetches
 * automatically when you switch accounts in the header. It cannot show demo
 * and real at once — this app authorizes one account token per session, and
 * switching accounts to peek at the other risks disrupting a running bot.
 */

type TDayTotal = { date: string; label: string; profit: number; trades: number; isToday: boolean };

const Journal = observer(() => {
    const { activeLoginid, accountList } = useApiBase();
    const { convert, format, has_rates } = useDisplayCurrency();

    const [entries, setEntries] = useState<TProfitEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const load = useCallback(async () => {
        if (!activeLoginid) return;
        setIsLoading(true);
        setError(null);
        const monthStart = moment().startOf('month').unix();
        const res = await fetchMonthProfitTable(monthStart);
        if ('error' in res) {
            setError(res.error);
            setEntries(null);
        } else {
            setEntries(res.entries);
            setTruncated(res.truncated);
        }
        setIsLoading(false);
    }, [activeLoginid]);

    // Refetch whenever the active account changes, so switching in the header
    // updates which account's ledger is shown rather than leaving stale data.
    useEffect(() => {
        load();
    }, [load]);

    const { today, days, monthTotal, monthTrades } = useMemo(() => {
        if (!entries) return { today: { profit: 0, trades: 0 }, days: [], monthTotal: 0, monthTrades: 0 };

        const todayKey = moment().format('YYYY-MM-DD');
        const byDay = new Map<string, { profit: number; trades: number }>();

        // moment.unix() reads a real epoch and defaults to local mode, so
        // this lands on the user's own calendar day correctly without the
        // manual UTC handling a pre-formatted date string would need.
        entries.forEach(e => {
            const dayKey = moment.unix(e.sell_time).format('YYYY-MM-DD');
            const entry = byDay.get(dayKey) ?? { profit: 0, trades: 0 };
            entry.profit += e.profit;
            entry.trades += 1;
            byDay.set(dayKey, entry);
        });

        const dayRows: TDayTotal[] = [...byDay.entries()]
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .map(([date, v]) => ({
                date,
                label: moment(date).format('ddd D MMM'),
                profit: +v.profit.toFixed(2),
                trades: v.trades,
                isToday: date === todayKey,
            }));

        const todayEntry = byDay.get(todayKey);
        const monthSum = dayRows.reduce((sum, d) => sum + d.profit, 0);
        const monthCount = dayRows.reduce((sum, d) => sum + d.trades, 0);

        return {
            today: { profit: +((todayEntry?.profit ?? 0).toFixed(2)), trades: todayEntry?.trades ?? 0 },
            days: dayRows,
            monthTotal: +monthSum.toFixed(2),
            monthTrades: monthCount,
        };
    }, [entries]);

    const kes = (usd: number) => {
        const converted = convert(usd, 'USD');
        return converted === null ? null : format(converted, 'KES');
    };

    const active_account = accountList?.find(a => a.loginid === activeLoginid);
    const is_demo = isDemoAccount(activeLoginid ?? '');

    return (
        <div className='vx-journal'>
            <div className='vx-journal__head'>
                <div className='vx-journal__title-row'>
                    <h2>Journal</h2>
                    {activeLoginid && (
                        <span className={`vx-journal__account-pill ${is_demo ? 'is-demo' : 'is-real'}`}>
                            {is_demo ? 'Demo' : 'Real'} · {activeLoginid}
                        </span>
                    )}
                </div>
                <p>
                    Real profit and loss from Deriv&rsquo;s own record for this account
                    {active_account?.currency ? ` (${active_account.currency})` : ''}. Switch accounts in the header
                    to see the other ledger — demo and real can&rsquo;t be shown at once.{' '}
                    {has_rates ? 'Converted to KES at live rates.' : 'KES conversion needs live rates.'}
                </p>
            </div>

            {error && (
                <div className='vx-journal__error'>
                    <p>{error}</p>
                    <button type='button' onClick={load}>
                        Retry
                    </button>
                </div>
            )}

            {!activeLoginid && !isLoading && (
                <p className='vx-journal__loading'>Log in to see this account&rsquo;s journal.</p>
            )}

            {isLoading && !entries && <p className='vx-journal__loading'>Loading this month&rsquo;s trades…</p>}

            {entries && (
                <>
                    <div className='vx-journal__stats'>
                        <div className={`vx-stat ${today.profit >= 0 ? 'vx-stat--up' : 'vx-stat--down'}`}>
                            <span className='vx-stat__label'>Today — USD</span>
                            <span className='vx-stat__value'>{today.profit.toFixed(2)}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Today — KES</span>
                            <span className='vx-stat__value'>{kes(today.profit) ?? '—'}</span>
                        </div>
                        <div className={`vx-stat ${monthTotal >= 0 ? 'vx-stat--up' : 'vx-stat--down'}`}>
                            <span className='vx-stat__label'>This month — USD</span>
                            <span className='vx-stat__value'>{monthTotal.toFixed(2)}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>This month — KES</span>
                            <span className='vx-stat__value'>{kes(monthTotal) ?? '—'}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Trades today</span>
                            <span className='vx-stat__value'>{today.trades}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Trades this month</span>
                            <span className='vx-stat__value'>{monthTrades}</span>
                        </div>
                    </div>

                    <div className='vx-card vx-journal__days'>
                        <h3>Days this month</h3>
                        {days.length === 0 ? (
                            <p className='vx-journal__empty'>
                                No settled contracts on Deriv&rsquo;s record for this account this month yet.
                            </p>
                        ) : (
                            <div className='vx-journal__tablewrap'>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Day</th>
                                            <th>Trades</th>
                                            <th>P/L (USD)</th>
                                            <th>P/L (KES)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {days.map(d => (
                                            <tr key={d.date} className={d.isToday ? 'vx-journal__row--today' : ''}>
                                                <td>
                                                    {d.label}
                                                    {d.isToday && <span className='vx-journal__todaytag'>today</span>}
                                                </td>
                                                <td>{d.trades}</td>
                                                <td className={d.profit >= 0 ? 'is-pos' : 'is-neg'}>
                                                    {d.profit.toFixed(2)}
                                                </td>
                                                <td>{kes(d.profit) ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {truncated && (
                            <p className='vx-journal__note'>
                                This account traded enough this month that the totals above stop at the first 1,000
                                settled contracts fetched, oldest first within that cap — not necessarily all of
                                them.
                            </p>
                        )}
                        <p className='vx-journal__note'>
                            Sourced from Deriv&rsquo;s own profit_table for this account — real and persistent,
                            unaffected by resetting the run panel in this app.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
});

export default Journal;
