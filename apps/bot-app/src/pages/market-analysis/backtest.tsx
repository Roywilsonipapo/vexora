import { useState } from 'react';
import { runBacktest, TBacktestResult, TContract } from './backtest-engine';
import { fetchPayoutRatio } from './fetch-payout';
import { fetchTickHistory, SYMBOLS } from './tick-utils';
import './market-analysis.scss';

/**
 * Strategy Backtester.
 *
 * Replays a staking plan over real recent ticks and reports what would have
 * happened. Everything shown is historical fact about a finite sample — the
 * copy has to keep saying so, because a green P/L here is exactly the kind of
 * number people mistake for a forecast.
 */

const CONTRACTS: { value: TContract; label: string; barrier: boolean }[] = [
    { value: 'DIGITOVER', label: 'Digit Over', barrier: true },
    { value: 'DIGITUNDER', label: 'Digit Under', barrier: true },
    { value: 'DIGITEVEN', label: 'Digit Even', barrier: false },
    { value: 'DIGITODD', label: 'Digit Odd', barrier: false },
    { value: 'DIGITMATCH', label: 'Digit Matches', barrier: true },
    { value: 'DIGITDIFF', label: 'Digit Differs', barrier: true },
];

const TICK_CHOICES = [200, 500, 1000, 2500, 5000];

const Backtest = () => {
    const [symbol, setSymbol] = useState('R_100');
    const [contract, setContract] = useState<TContract>('DIGITOVER');
    const [barrier, setBarrier] = useState(1);
    const [baseStake, setBaseStake] = useState(1);
    const [multiplier, setMultiplier] = useState(2);
    const [maxSteps, setMaxSteps] = useState(4);
    const [sessionLoss, setSessionLoss] = useState(50);
    const [takeProfit, setTakeProfit] = useState(15);
    const [tickCount, setTickCount] = useState(1000);

    const [payout, setPayout] = useState<number | null>(null);
    const [payoutNote, setPayoutNote] = useState<string | null>(null);
    const [manualPayout, setManualPayout] = useState('');

    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TBacktestResult | null>(null);
    const [ranOn, setRanOn] = useState<string | null>(null);

    const needsBarrier = CONTRACTS.find(c => c.value === contract)?.barrier ?? false;

    const run = async () => {
        setIsRunning(true);
        setError(null);
        setResult(null);
        setPayoutNote(null);

        // Real payout first — without it there is nothing honest to compute.
        const priced = await fetchPayoutRatio(symbol, contract, barrier);
        let ratio: number | null = null;

        if ('ratio' in priced) {
            ratio = priced.ratio;
            setPayout(ratio);
        } else {
            const typed = Number(manualPayout);
            if (typed > 1) {
                ratio = typed;
                setPayoutNote(`Using the payout you entered (${typed}). Deriv said: ${priced.error}`);
            } else {
                setError(
                    `Couldn't get the real payout for this contract — ${priced.error} Log in, or type the payout ratio from DTrader below. I won't guess it, because a made-up payout produces a confident but wrong result.`
                );
                setIsRunning(false);
                return;
            }
        }

        const history = await fetchTickHistory(symbol, tickCount);
        if (!history) {
            setError('Could not load tick history for this market. Try again shortly.');
            setIsRunning(false);
            return;
        }

        const res = runBacktest(history.prices, history.pip_size, {
            contract,
            barrier,
            base_stake: baseStake,
            multiplier,
            max_steps: maxSteps,
            session_loss: sessionLoss,
            take_profit: takeProfit,
            payout_ratio: ratio,
        });

        setResult(res);
        setRanOn(`${history.prices.length} real ticks · payout ${ratio}x`);
        setIsRunning(false);
    };

    const stopLabel: Record<TBacktestResult['stopped_reason'], string> = {
        session_loss: 'Hit the session loss limit',
        take_profit: 'Hit the take profit target',
        ran_out_of_ticks: 'Ran to the end of the sample',
    };

    // Equity curve, normalised into the viewbox. Drawn from the running P/L so
    // the shape shows the drawdowns, not just the endpoint.
    const curve = (() => {
        if (!result || result.equity.length < 2) return null;
        const eq = result.equity;
        const min = Math.min(...eq, 0);
        const max = Math.max(...eq, 0);
        const span = max - min || 1;
        const pts = eq
            .map((v, i) => `${((i / (eq.length - 1)) * 100).toFixed(2)},${(100 - ((v - min) / span) * 100).toFixed(2)}`)
            .join(' ');
        const zeroY = (100 - ((0 - min) / span) * 100).toFixed(2);
        return { pts, zeroY };
    })();

    return (
        <div className='vx-backtest'>
            <div className='vx-card vx-backtest__form'>
                <h3 className='vx-backtest__title'>Strategy Backtester</h3>
                <p className='vx-backtest__lede'>
                    Replays a staking plan over real recent ticks and reports what it would have done. This is a
                    record of one past sample, not a forecast.
                </p>

                <div className='vx-backtest__grid'>
                    <label>
                        <span>Market</span>
                        <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                            {SYMBOLS.map(s => (
                                <option key={s.code} value={s.code}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <span>Contract</span>
                        <select value={contract} onChange={e => setContract(e.target.value as TContract)}>
                            {CONTRACTS.map(c => (
                                <option key={c.value} value={c.value}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    {needsBarrier && (
                        <label>
                            <span>Barrier / digit</span>
                            <select value={barrier} onChange={e => setBarrier(Number(e.target.value))}>
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                                    <option key={d} value={d}>
                                        {d}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <label>
                        <span>Base stake</span>
                        <input
                            type='number'
                            min='0.35'
                            step='0.5'
                            value={baseStake}
                            onChange={e => setBaseStake(Number(e.target.value))}
                        />
                    </label>

                    <label>
                        <span>Loss multiplier</span>
                        <input
                            type='number'
                            min='1'
                            step='0.1'
                            value={multiplier}
                            onChange={e => setMultiplier(Number(e.target.value))}
                        />
                    </label>

                    <label>
                        <span>Step cap (0 = uncapped)</span>
                        <input
                            type='number'
                            min='0'
                            step='1'
                            value={maxSteps}
                            onChange={e => setMaxSteps(Number(e.target.value))}
                        />
                    </label>

                    <label>
                        <span>Session loss stop</span>
                        <input
                            type='number'
                            min='0'
                            step='5'
                            value={sessionLoss}
                            onChange={e => setSessionLoss(Number(e.target.value))}
                        />
                    </label>

                    <label>
                        <span>Take profit (0 = off)</span>
                        <input
                            type='number'
                            min='0'
                            step='5'
                            value={takeProfit}
                            onChange={e => setTakeProfit(Number(e.target.value))}
                        />
                    </label>

                    <label>
                        <span>Ticks to replay</span>
                        <select value={tickCount} onChange={e => setTickCount(Number(e.target.value))}>
                            {TICK_CHOICES.map(t => (
                                <option key={t} value={t}>
                                    {t.toLocaleString()}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <button type='button' className='vx-backtest__run' onClick={run} disabled={isRunning}>
                    {isRunning ? 'Replaying…' : 'Run backtest'}
                </button>

                {payout !== null && !error && (
                    <p className='vx-backtest__payout'>Live payout for this contract: {payout}x stake</p>
                )}
                {payoutNote && <p className='vx-backtest__warn'>{payoutNote}</p>}

                {error && (
                    <div className='vx-backtest__error'>
                        <p>{error}</p>
                        <label className='vx-backtest__manual'>
                            <span>Payout ratio from DTrader</span>
                            <input
                                type='number'
                                min='1'
                                step='0.01'
                                placeholder='e.g. 1.95'
                                value={manualPayout}
                                onChange={e => setManualPayout(e.target.value)}
                            />
                        </label>
                    </div>
                )}
            </div>

            {result && (
                <div className='vx-card vx-backtest__results'>
                    <div className='vx-backtest__resulthead'>
                        <h3>Result</h3>
                        <span className='vx-backtest__sample'>{ranOn}</span>
                    </div>

                    <div className='vx-backtest__stats'>
                        <div className={`vx-stat ${result.final_pl >= 0 ? 'vx-stat--up' : 'vx-stat--down'}`}>
                            <span className='vx-stat__label'>Final P/L</span>
                            <span className='vx-stat__value'>{result.final_pl.toFixed(2)}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Win rate</span>
                            <span className='vx-stat__value'>{result.win_rate}%</span>
                        </div>
                        <div className='vx-stat vx-stat--down'>
                            <span className='vx-stat__label'>Max drawdown</span>
                            <span className='vx-stat__value'>{result.max_drawdown.toFixed(2)}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Worst losing run</span>
                            <span className='vx-stat__value'>{result.longest_loss_streak}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Biggest stake reached</span>
                            <span className='vx-stat__value'>{result.peak_stake.toFixed(2)}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Trades</span>
                            <span className='vx-stat__value'>{result.trades}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Total staked</span>
                            <span className='vx-stat__value'>{result.total_staked.toFixed(2)}</span>
                        </div>
                        <div className='vx-stat'>
                            <span className='vx-stat__label'>Cap resets</span>
                            <span className='vx-stat__value'>{result.cap_hits}</span>
                        </div>
                    </div>

                    <p className='vx-backtest__stopped'>Ended: {stopLabel[result.stopped_reason]}</p>

                    {curve && (
                        <div className='vx-backtest__curve'>
                            <svg viewBox='0 0 100 100' preserveAspectRatio='none' aria-label='Equity curve'>
                                <line
                                    x1='0'
                                    y1={curve.zeroY}
                                    x2='100'
                                    y2={curve.zeroY}
                                    className='vx-backtest__zero'
                                    vectorEffect='non-scaling-stroke'
                                />
                                <polyline
                                    points={curve.pts}
                                    className={
                                        result.final_pl >= 0 ? 'vx-backtest__line--up' : 'vx-backtest__line--down'
                                    }
                                    vectorEffect='non-scaling-stroke'
                                />
                            </svg>
                            <span className='vx-backtest__curvelabel'>
                                Running P/L across the sample. The dotted line is break-even.
                            </span>
                        </div>
                    )}

                    <p className='vx-backtest__note'>
                        These are the digits that actually occurred on {result.trades.toLocaleString()} ticks. Synthetic
                        indices are random per tick, so this does not carry forward — a different sample gives a
                        different answer. Read <strong>max drawdown</strong> and <strong>biggest stake reached</strong>
                        {' '}before the P/L: they are what decide whether the plan survives a bad run.
                    </p>
                </div>
            )}
        </div>
    );
};

export default Backtest;
