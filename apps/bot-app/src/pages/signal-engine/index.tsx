import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { TContract } from '@/pages/market-analysis/backtest-engine';
import { localize } from '@deriv-com/translations';
import { TMarketType } from './journal-store';
import { getSignalEngineStore, TSignalDirection } from './signal-engine-store';
import './signal-engine.scss';

const FOREX_SYMBOLS = [{ code: 'frxEURUSD', label: 'EUR/USD' }];
const DIGITS_SYMBOLS = [
    { code: 'R_10', label: 'Volatility 10' },
    { code: 'R_25', label: 'Volatility 25' },
    { code: 'R_50', label: 'Volatility 50' },
    { code: 'R_75', label: 'Volatility 75' },
    { code: 'R_100', label: 'Volatility 100' },
];
const DIGIT_CONTRACTS: { value: TContract; label: string; needs_barrier: boolean }[] = [
    { value: 'DIGITOVER', label: 'Digit Over', needs_barrier: true },
    { value: 'DIGITUNDER', label: 'Digit Under', needs_barrier: true },
    { value: 'DIGITMATCH', label: 'Digit Matches', needs_barrier: true },
    { value: 'DIGITDIFF', label: 'Digit Differs', needs_barrier: true },
    { value: 'DIGITEVEN', label: 'Digit Even', needs_barrier: false },
    { value: 'DIGITODD', label: 'Digit Odd', needs_barrier: false },
];

const STATUS_LABEL: Record<string, string> = { idle: 'Idle', connecting: 'Connecting…', armed: 'Armed', error: 'Error' };

const signalTone = (signal: TSignalDirection): string => {
    if (signal === 'CALL' || signal === 'CONTRACT') return 'up';
    if (signal === 'PUT') return 'down';
    return 'neutral';
};

const signalText = (signal: TSignalDirection): string => {
    if (signal === 'CALL') return 'RISE';
    if (signal === 'PUT') return 'FALL';
    if (signal === 'CONTRACT') return 'TRADE';
    return 'NO TRADE';
};

const contractLabel = (contract_type: string, barrier?: number): string =>
    barrier !== undefined ? `${contract_type} ${barrier}` : contract_type;

/**
 * Binary Scalper — see signal-engine-store.ts for the full pipeline this
 * renders. Deliberately shows raw numbers (probabilities, p-values, sample
 * sizes) rather than a polished "confidence meter" abstraction — the point
 * of this tool is that every claim traces back to a real, inspectable
 * calculation, which a purely decorative gauge would hide.
 */
const SignalEnginePage = observer(() => {
    const root_store = useStore();
    const store = getSignalEngineStore(root_store);
    const [showConfirm, setShowConfirm] = useState(false);
    const [journalFilter, setJournalFilter] = useState<'all' | TMarketType>('all');

    const prediction = store.current_prediction;
    const ensemble = store.getEnsembleForCurrentConfig();
    const selected_digit_contract = DIGIT_CONTRACTS.find(c => c.value === store.digits_contract);

    const handleArmClick = () => setShowConfirm(true);
    const confirmArm = () => {
        setShowConfirm(false);
        store.arm();
    };

    return (
        <div className='vx-scalper'>
            <div className='vx-scalper__header'>
                <div>
                    <h2 className='vx-scalper__title'>{localize('Binary Scalper')}</h2>
                    <p className='vx-scalper__subtitle'>
                        {localize('Real-time trading intelligence — demo/paper by default, real market data always.')}
                    </p>
                </div>
                <div className={`vx-scalper__status vx-scalper__status--${store.status}`}>
                    <span className='vx-scalper__status-dot' />
                    {STATUS_LABEL[store.status]}
                </div>
            </div>

            <div className='vx-scalper__config'>
                <label>
                    <span>{localize('Market')}</span>
                    <select
                        value={store.market_type}
                        disabled={store.status !== 'idle'}
                        onChange={e => store.setMarketType(e.target.value as TMarketType)}
                    >
                        <option value='forex'>{localize('Forex Binary')}</option>
                        <option value='digits'>{localize('Digits')}</option>
                    </select>
                </label>

                {store.market_type === 'forex' ? (
                    <label>
                        <span>{localize('Symbol')}</span>
                        <select value={store.forex_symbol} disabled={store.status !== 'idle'} onChange={e => store.setForexSymbol(e.target.value)}>
                            {FOREX_SYMBOLS.map(s => (
                                <option key={s.code} value={s.code}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : (
                    <>
                        <label>
                            <span>{localize('Symbol')}</span>
                            <select
                                value={store.digits_symbol}
                                disabled={store.status !== 'idle'}
                                onChange={e => store.setDigitsSymbol(e.target.value)}
                            >
                                {DIGITS_SYMBOLS.map(s => (
                                    <option key={s.code} value={s.code}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>{localize('Contract')}</span>
                            <select
                                value={store.digits_contract}
                                disabled={store.status !== 'idle'}
                                onChange={e => store.setDigitsContract(e.target.value as TContract)}
                            >
                                {DIGIT_CONTRACTS.map(c => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {selected_digit_contract?.needs_barrier && (
                            <label>
                                <span>{localize('Barrier')}</span>
                                <input
                                    type='number'
                                    min={0}
                                    max={9}
                                    value={store.digits_barrier}
                                    disabled={store.status !== 'idle'}
                                    onChange={e => store.setDigitsBarrier(Number(e.target.value))}
                                />
                            </label>
                        )}
                    </>
                )}

                <label>
                    <span>{localize('Stake')}</span>
                    <input
                        type='number'
                        min={0}
                        step='0.1'
                        value={store.stake}
                        disabled={store.status !== 'idle'}
                        onChange={e => store.setStake(Number(e.target.value))}
                    />
                </label>

                <label>
                    <span>
                        {localize('Confidence threshold')}: {Math.round(store.confidence_threshold * 100)}%
                    </span>
                    <input
                        type='range'
                        min={0.5}
                        max={0.9}
                        step={0.01}
                        value={store.confidence_threshold}
                        onChange={e => store.setConfidenceThreshold(Number(e.target.value))}
                    />
                </label>

                {store.status === 'idle' ? (
                    <button type='button' className='vx-scalper__arm' onClick={handleArmClick}>
                        {localize('Arm')}
                    </button>
                ) : (
                    <button type='button' className='vx-scalper__disarm' onClick={() => store.disarm()}>
                        {localize('Disarm')}
                    </button>
                )}
            </div>

            <div className='vx-scalper__grid'>
                <div className='vx-scalper__panel'>
                    <div className='vx-scalper__panel-title'>{localize('Live market')}</div>
                    {store.market_type === 'forex' ? (
                        <>
                            <div className='vx-scalper__stat-row'>
                                <span>{localize('Price')}</span>
                                <span className='vx-scalper__mono'>{store.current_price?.toFixed(5) ?? '—'}</span>
                            </div>
                            {prediction?.market_type === 'forex' &&
                                prediction.explanations.map(e => (
                                    <div className='vx-scalper__stat-row' key={e.label}>
                                        <span>{e.label}</span>
                                        <span className='vx-scalper__mono'>{e.value}</span>
                                    </div>
                                ))}
                        </>
                    ) : (
                        <>
                            <div className='vx-scalper__stat-row'>
                                <span>{localize('Live digit')}</span>
                                <span className='vx-scalper__mono'>{store.current_digit ?? '—'}</span>
                            </div>
                            {store.digit_stats && (
                                <>
                                    <div className='vx-scalper__digit-bars'>
                                        {store.digit_stats.frequencies.map((f, d) => (
                                            <div key={d} className='vx-scalper__digit-bar-col'>
                                                <div className='vx-scalper__digit-bar' style={{ height: `${Math.min(100, f * 300)}%` }} />
                                                <span>{d}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className='vx-scalper__stat-row'>
                                        <span>{localize('Entropy ratio')}</span>
                                        <span className='vx-scalper__mono'>{store.digit_stats.entropy_ratio.toFixed(3)}</span>
                                    </div>
                                    <div className='vx-scalper__stat-row'>
                                        <span>{localize('Chi-square p-value')}</span>
                                        <span className='vx-scalper__mono'>{store.digit_stats.chi_square_p_value.toFixed(3)}</span>
                                    </div>
                                    <div className='vx-scalper__stat-row'>
                                        <span>{localize('Sample size')}</span>
                                        <span className='vx-scalper__mono'>{store.digit_stats.sample_size}</span>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className='vx-scalper__panel vx-scalper__panel--signal'>
                    <div className='vx-scalper__panel-title'>{localize('AI signal')}</div>
                    {prediction ? (
                        <>
                            <div className={`vx-scalper__signal-badge vx-scalper__signal-badge--${signalTone(prediction.signal)}`}>
                                {signalText(prediction.signal)}
                            </div>
                            <div className='vx-scalper__stat-row'>
                                <span>{localize('Probability')}</span>
                                <span className='vx-scalper__mono'>{(prediction.ensemble.ensemble_probability * 100).toFixed(1)}%</span>
                            </div>
                            <div className='vx-scalper__stat-row'>
                                <span>{localize('Confidence')}</span>
                                <span>{prediction.confidence_label}</span>
                            </div>
                            <div className='vx-scalper__stat-row'>
                                <span>{localize('Model agreement')}</span>
                                <span>{prediction.ensemble.agreement_label}</span>
                            </div>
                            {prediction.regime_label && (
                                <div className='vx-scalper__stat-row'>
                                    <span>{localize('Market regime')}</span>
                                    <span>{prediction.regime_label}</span>
                                </div>
                            )}
                            <div className='vx-scalper__stat-row'>
                                <span>{localize('Statistical evidence')}</span>
                                <span>{prediction.evidence.label}</span>
                            </div>
                            <div className='vx-scalper__stat-row'>
                                <span>{localize('Evidence sample')}</span>
                                <span className='vx-scalper__mono'>{prediction.evidence.sample_size}</span>
                            </div>
                        </>
                    ) : (
                        <div className='vx-scalper__no-data'>{localize('Waiting for enough data…')}</div>
                    )}
                </div>

                <div className='vx-scalper__panel'>
                    <div className='vx-scalper__panel-title'>{localize('Model panel')}</div>
                    {prediction?.ensemble.predictions.map(m => (
                        <div className='vx-scalper__stat-row' key={m.name}>
                            <span>
                                {m.name}
                                {!m.is_trained && ` (${localize('untrained')})`}
                            </span>
                            <span className='vx-scalper__mono'>{(m.probability * 100).toFixed(1)}%</span>
                        </div>
                    ))}
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Model version')}</span>
                        <span className='vx-scalper__mono'>v{ensemble.version}</span>
                    </div>
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Lifetime accuracy')}</span>
                        <span className='vx-scalper__mono'>
                            {(ensemble.lifetimeAccuracy * 100).toFixed(1)}% ({ensemble.sampleSize})
                        </span>
                    </div>
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Rolling accuracy')}</span>
                        <span className='vx-scalper__mono'>{(ensemble.rollingAccuracy * 100).toFixed(1)}%</span>
                    </div>
                    {ensemble.driftDetected && (
                        <div className='vx-scalper__warning'>
                            {localize('Model drift detected — rolling accuracy has dropped versus lifetime.')}
                        </div>
                    )}
                    {ensemble.canRollback && (
                        <button type='button' className='vx-scalper__rollback' onClick={() => ensemble.rollback()}>
                            {localize('Roll back last retrain')}
                        </button>
                    )}
                </div>

                <div className='vx-scalper__panel'>
                    <div className='vx-scalper__panel-title'>{localize('Risk')}</div>
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Trades today')}</span>
                        <span className='vx-scalper__mono'>
                            {store.risk_engine.state.trades_today} / {store.risk_config.max_trades_per_day}
                        </span>
                    </div>
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Daily P/L')}</span>
                        <span className='vx-scalper__mono'>{store.risk_engine.state.daily_pl.toFixed(2)}</span>
                    </div>
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Consecutive losses')}</span>
                        <span className='vx-scalper__mono'>
                            {store.risk_engine.state.consecutive_losses} / {store.risk_config.max_consecutive_losses}
                        </span>
                    </div>
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Exposure')}</span>
                        <span className='vx-scalper__mono'>{store.has_pending_trade ? store.stake.toFixed(2) : '0.00'}</span>
                    </div>
                    <div className='vx-scalper__stat-row'>
                        <span>{localize('Trading status')}</span>
                        <span>{store.risk_engine.state.emergency_stopped ? localize('EMERGENCY STOP') : localize('Allowed')}</span>
                    </div>
                    {store.risk_engine.state.emergency_stopped ? (
                        <button type='button' className='vx-scalper__clear-stop' onClick={store.clearEmergencyStop}>
                            {localize('Clear emergency stop')}
                        </button>
                    ) : (
                        <button type='button' className='vx-scalper__emergency' onClick={store.emergencyStop}>
                            {localize('Emergency stop')}
                        </button>
                    )}
                </div>
            </div>

            <div className='vx-scalper__journal'>
                <div className='vx-scalper__panel-title'>{localize('Trade journal')}</div>
                <div className='vx-scalper__journal-filter'>
                    {(['all', 'forex', 'digits'] as const).map(f => (
                        <button
                            key={f}
                            type='button'
                            className={journalFilter === f ? 'is-active' : ''}
                            onClick={() => setJournalFilter(f)}
                        >
                            {f === 'all' ? localize('All') : f === 'forex' ? localize('Forex') : localize('Digits')}
                        </button>
                    ))}
                </div>
                <div className='vx-scalper__journal-table-wrap'>
                    <table className='vx-scalper__journal-table'>
                        <thead>
                            <tr>
                                <th>{localize('Time')}</th>
                                <th>{localize('Market')}</th>
                                <th>{localize('Contract')}</th>
                                <th>{localize('Prob.')}</th>
                                <th>{localize('Confidence')}</th>
                                <th>{localize('Regime')}</th>
                                <th>{localize('Result')}</th>
                                <th>{localize('P/L')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {store.journal.entries
                                .filter(e => journalFilter === 'all' || e.market_type === journalFilter)
                                .slice(0, 50)
                                .map(e => (
                                    <tr key={e.id}>
                                        <td>{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                                        <td>{e.market_type}</td>
                                        <td>{contractLabel(e.contract_type, e.barrier)}</td>
                                        <td>{(e.ensemble_probability * 100).toFixed(1)}%</td>
                                        <td>{e.confidence_label}</td>
                                        <td>{e.market_regime ?? '—'}</td>
                                        <td className={e.won ? 'is-win' : 'is-loss'}>{e.won ? localize('Won') : localize('Lost')}</td>
                                        <td className={e.won ? 'is-win' : 'is-loss'}>{e.profit.toFixed(2)}</td>
                                    </tr>
                                ))}
                            {store.journal.entries.length === 0 && (
                                <tr>
                                    <td colSpan={8} className='vx-scalper__journal-empty'>
                                        {localize('No trades recorded yet.')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className='vx-scalper__log'>
                <div className='vx-scalper__panel-title'>{localize('Activity')}</div>
                <ul>
                    {store.log.slice(0, 20).map(entry => (
                        <li key={entry.id} className={`vx-scalper__log-item vx-scalper__log-item--${entry.kind}`}>
                            <span>{entry.text}</span>
                            <span className='vx-scalper__log-time'>
                                {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </li>
                    ))}
                    {store.log.length === 0 && <li className='vx-scalper__log-empty'>{localize('Nothing yet.')}</li>}
                </ul>
            </div>

            {showConfirm && (
                <div className='vx-scalper__confirm'>
                    <div className='vx-scalper__confirm-card'>
                        <h4>{localize('Arm the Binary Scalper?')}</h4>
                        <p>
                            {localize(
                                "Calibration trades are simulated using real market data and real payout quotes — no money moves. Once the model reaches a statistically validated edge, this hands that one decision off to Auto-Runner, which places the real trade on your active account and disarms Binary Scalper."
                            )}
                        </p>
                        <div className='vx-scalper__confirm-actions'>
                            <button type='button' onClick={() => setShowConfirm(false)}>
                                {localize('Cancel')}
                            </button>
                            <button type='button' className='vx-scalper__confirm-yes' onClick={confirmArm}>
                                {localize('Arm it')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default SignalEnginePage;
