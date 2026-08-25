import { useMemo } from 'react';
import moment from 'moment';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { TContractInfo } from '@/components/summary/summary-card.types';
import './journal.scss';

/**
 * Journal — today's and this month's real profit/loss, in USD and KES.
 *
 * The numbers come from transactions_store, which records every completed
 * contract in this browser tab (see transactions-store.ts, `pushTransaction`).
 * Nothing here is invented — a day with no recorded trades shows nothing
 * rather than a manufactured zero-with-confidence.
 *
 * Two honest limits, stated in the UI rather than left implicit:
 *  - The cache lives in sessionStorage, not localStorage, so it clears when
 *    this tab closes. It is a same-session ledger, not a permanent record.
 *  - It only sees trades placed through this app in this browser. Deriv's own
 *    statement is the complete record; this is not a replacement for it.
 */

// Matches the exact format transactions-store.ts writes date_start in
// (see pushTransaction: formatDate(data.date_start, 'YYYY-M-D HH:mm:ss [GMT]')).
const DATE_FORMAT = 'YYYY-M-D HH:mm:ss [GMT]';

type TDayTotal = { date: string; label: string; profit: number; trades: number; isToday: boolean };

const Journal = observer(() => {
    const { transactions: transactions_store } = useStore();
    const { convert, format, has_rates } = useDisplayCurrency();

    const { today, days, monthTotal, monthTrades } = useMemo(() => {
        const now = moment();
        const monthKey = now.format('YYYY-MM');
        const todayKey = now.format('YYYY-MM-DD');

        const byDay = new Map<string, { profit: number; trades: number }>();

        transactions_store.transactions.forEach(trx => {
            if (trx.type !== 'contract' || typeof trx.data !== 'object') return;
            const contract = trx.data as TContractInfo;
            if (!contract.is_completed) return;

            // date_start is written as a UTC instant with a literal "GMT"
            // suffix (see transactions-store.ts), but a plain moment(str, fmt)
            // parses the numbers in local mode — the "[GMT]" token is consumed
            // as text, not interpreted as a timezone. Near midnight that reads
            // a trade onto the wrong calendar day (confirmed: a trade at
            // 01:00 EAT / 22:00 UTC the previous day parsed back as UTC's
            // date instead of the user's own). Parse as UTC explicitly, then
            // convert to local so "today" matches the user's own day.
            const parsed = moment.utc(contract.date_start, DATE_FORMAT).local();
            if (!parsed.isValid() || parsed.format('YYYY-MM') !== monthKey) return;

            const dayKey = parsed.format('YYYY-MM-DD');
            const entry = byDay.get(dayKey) ?? { profit: 0, trades: 0 };
            entry.profit += Number(contract.profit) || 0;
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
    }, [transactions_store.transactions]);

    const kes = (usd: number) => {
        const converted = convert(usd, 'USD');
        return converted === null ? null : format(converted, 'KES');
    };

    return (
        <div className='vx-journal'>
            <div className='vx-journal__head'>
                <h2>Journal</h2>
                <p>
                    Real profit and loss from trades placed through this app, this browser session.{' '}
                    {has_rates ? 'Converted to KES at live rates.' : 'KES conversion needs live rates — check the account menu.'}
                </p>
            </div>

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
                        No completed trades recorded yet this session. Run a bot and results will appear here as
                        contracts settle.
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
                                        <td className={d.profit >= 0 ? 'is-pos' : 'is-neg'}>{d.profit.toFixed(2)}</td>
                                        <td>{kes(d.profit) ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className='vx-journal__note'>
                    This is a same-session ledger, not a permanent record — it is stored for this browser tab only
                    and clears when the tab closes. It only sees trades placed through this app; it is not a
                    substitute for Deriv&rsquo;s own account statement.
                </p>
            </div>
        </div>
    );
});

export default Journal;
