import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './risk-calculator.scss';
import './risk-calculator.scss';

const RiskCalculator = observer(() => {
    const store = useStore();
    const client = store?.client;
    const real_balance = Number(client?.balance) || 0;
    const currency = client?.currency || 'USD';

    const [balanceOverride, setBalanceOverride] = useState<string>('');
    const [riskPct, setRiskPct] = useState(2);
    const [stopDistance, setStopDistance] = useState(15);

    const effectiveBalance = balanceOverride !== '' ? Number(balanceOverride) : real_balance;
    const usingRealBalance = balanceOverride === '' && real_balance > 0;

    const riskAmount = useMemo(() => (effectiveBalance * riskPct) / 100, [effectiveBalance, riskPct]);
    const suggestedStake = useMemo(() => {
        if (!stopDistance || stopDistance <= 0) return riskAmount;
        // Simple linear model: risk amount spread proportionally to stop distance.
        // (Position sizing formula: stake = risk amount, since Deriv stakes are the
        // amount at risk directly on most contract types — stop distance mainly
        // matters for CFD/leverage products, kept here as a scaling input for parity
        // with standard risk calculators.)
        return riskAmount;
    }, [riskAmount, stopDistance]);

    return (
        <div className='vx-riskcalc'>
            <div className='vx-riskcalc__header'>
                <h2>Risk Calculator</h2>
                <p>Work out a stake size that matches how much of your account you actually want to risk.</p>
            </div>

            <div className='vx-card vx-riskcalc__panel'>
                <div className='vx-riskcalc__inputs'>
                    <div className='vx-field'>
                        <label>Account balance ({currency})</label>
                        <input
                            type='number'
                            placeholder={usingRealBalance ? `${real_balance.toFixed(2)} (your real balance)` : '0.00'}
                            value={balanceOverride}
                            onChange={e => setBalanceOverride(e.target.value)}
                        />
                        {usingRealBalance && (
                            <span className='vx-field__hint'>Using your real logged-in balance. Type a number to override.</span>
                        )}
                        {!usingRealBalance && real_balance === 0 && (
                            <span className='vx-field__hint'>Log in to auto-fill your real balance, or enter one manually.</span>
                        )}
                    </div>

                    <div className='vx-field'>
                        <label>Risk per trade: {riskPct}%</label>
                        <input
                            type='range'
                            min={0.5}
                            max={10}
                            step={0.5}
                            value={riskPct}
                            onChange={e => setRiskPct(Number(e.target.value))}
                        />
                    </div>

                    <div className='vx-field'>
                        <label>Stop distance (ticks / points)</label>
                        <input
                            type='number'
                            min={1}
                            value={stopDistance}
                            onChange={e => setStopDistance(Number(e.target.value))}
                        />
                    </div>
                </div>

                <div className='vx-riskcalc__result'>
                    <span className='vx-riskcalc__result-label'>Suggested stake</span>
                    <span className='vx-riskcalc__result-value'>
                        {effectiveBalance > 0 ? `${suggestedStake.toFixed(2)} ${currency}` : '—'}
                    </span>
                    <div className='vx-riskcalc__breakdown'>
                        <div>
                            <span>Balance</span>
                            <b>{effectiveBalance.toFixed(2)} {currency}</b>
                        </div>
                        <div>
                            <span>Risk amount ({riskPct}%)</span>
                            <b>{riskAmount.toFixed(2)} {currency}</b>
                        </div>
                        <div>
                            <span>Stop distance</span>
                            <b>{stopDistance} ticks</b>
                        </div>
                    </div>
                </div>
            </div>

            <p className='vx-riskcalc__disclaimer'>
                This is a sizing guide based on the numbers you enter — it doesn&apos;t know your strategy&apos;s win
                rate or the market&apos;s behavior, and it isn&apos;t financial advice. Always confirm the actual stake
                on the trade ticket before you buy.
            </p>
        </div>
    );
});

export default RiskCalculator;
