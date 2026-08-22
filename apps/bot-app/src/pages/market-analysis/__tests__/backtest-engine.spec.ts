import { runBacktest, TBacktestConfig } from '../backtest-engine';

// pip_size 2 and prices as strings, matching what ticks_history returns.
const px = (digits: number[]) => digits.map(d => `100.0${d}`);

const base: TBacktestConfig = {
    contract: 'DIGITOVER',
    barrier: 1,
    base_stake: 1,
    multiplier: 2,
    max_steps: 0,
    session_loss: 0,
    take_profit: 0,
    payout_ratio: 1.9,
};

describe('runBacktest', () => {
    it('pays payout_ratio - 1 per win', () => {
        // Five digits of 9, Over 1 -> five wins at 0.90 each.
        const r = runBacktest(px([9, 9, 9, 9, 9]), 2, base);
        expect(r.wins).toBe(5);
        expect(r.losses).toBe(0);
        expect(r.final_pl).toBe(4.5);
        expect(r.win_rate).toBe(100);
        expect(r.max_drawdown).toBe(0);
    });

    it('escalates without a cap when max_steps is 0', () => {
        // Over 1 with digits 0,0,0 -> three losses, stakes 1 + 2 + 4 = 7.
        const r = runBacktest(px([0, 0, 0]), 2, base);
        expect(r.losses).toBe(3);
        expect(r.final_pl).toBe(-7);
        expect(r.peak_stake).toBe(4);
        expect(r.total_staked).toBe(7);
        expect(r.cap_hits).toBe(0);
        expect(r.longest_loss_streak).toBe(3);
    });

    it('resets to base stake when the step cap is reached', () => {
        // Cap of 2: stakes go 1, 2, then cap fires and the third is back to 1.
        const r = runBacktest(px([0, 0, 0]), 2, { ...base, max_steps: 2 });
        expect(r.final_pl).toBe(-4); // 1 + 2 + 1
        expect(r.peak_stake).toBe(2);
        expect(r.cap_hits).toBe(1);
    });

    it('measures drawdown from the running peak, not from zero', () => {
        // Win to +0.90, then two losses of 1 and 2 -> peak 0.90, trough -2.10.
        const r = runBacktest(px([9, 0, 0]), 2, base);
        expect(r.peak_pl).toBe(0.9);
        expect(r.final_pl).toBe(-2.1);
        expect(r.max_drawdown).toBe(3); // 0.90 down to -2.10
    });

    it('stops on session loss and reports why', () => {
        const r = runBacktest(px([0, 0, 0, 0, 0, 0]), 2, { ...base, session_loss: 3, multiplier: 1 });
        expect(r.stopped_reason).toBe('session_loss');
        expect(r.final_pl).toBe(-3);
        expect(r.trades).toBe(3); // stops the moment it crosses, not after
    });

    it('stops on take profit and reports why', () => {
        const r = runBacktest(px([9, 9, 9, 9, 9]), 2, { ...base, take_profit: 1.5 });
        expect(r.stopped_reason).toBe('take_profit');
        expect(r.trades).toBe(2); // 0.90 then 1.80 crosses 1.50
    });

    it('reports ran_out_of_ticks when neither limit is hit', () => {
        const r = runBacktest(px([9, 0]), 2, base);
        expect(r.stopped_reason).toBe('ran_out_of_ticks');
    });

    it('resolves each contract type against the right digits', () => {
        const digits = px([4]);
        const at = (c: TBacktestConfig['contract'], barrier: number) =>
            runBacktest(digits, 2, { ...base, contract: c, barrier, payout_ratio: 2 }).wins;

        expect(at('DIGITOVER', 3)).toBe(1); // 4 > 3
        expect(at('DIGITOVER', 4)).toBe(0); // not strictly greater
        expect(at('DIGITUNDER', 5)).toBe(1);
        expect(at('DIGITUNDER', 4)).toBe(0);
        expect(at('DIGITEVEN', 0)).toBe(1);
        expect(at('DIGITODD', 0)).toBe(0);
        expect(at('DIGITMATCH', 4)).toBe(1);
        expect(at('DIGITDIFF', 4)).toBe(0);
        expect(at('DIGITDIFF', 7)).toBe(1);
    });

    it('handles an empty tick list without dividing by zero', () => {
        const r = runBacktest([], 2, base);
        expect(r.trades).toBe(0);
        expect(r.win_rate).toBe(0);
        expect(r.final_pl).toBe(0);
        expect(r.equity).toEqual([]);
    });

    it('respects pip size when reading the last digit', () => {
        // pip_size 3 -> "100.019" has last digit 9, not 1.
        const r = runBacktest(['100.019'], 3, { ...base, contract: 'DIGITMATCH', barrier: 9, payout_ratio: 2 });
        expect(r.wins).toBe(1);
    });
});
