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

describe('runBacktest — deficit staking', () => {
    const deficit: TBacktestConfig = {
        ...base,
        staking: 'deficit',
        recover_over_wins: 4,
        max_stake: 25,
        take_profit: 5,
        payout_ratio: 1.95, // profit_per_unit = 0.95
    };

    it('sizes the next stake to the shortfall, not to a fixed base', () => {
        // One loss of 1.00 leaves pl = -1. Next stake should be
        // (5 - (-1)) / (4 * 0.95) = 6 / 3.8 = 1.578...
        const r = runBacktest(px([0, 0]), 2, deficit);
        // Trade 1 staked 1.00, trade 2 staked ~1.58 -> total ~2.58
        expect(r.total_staked).toBeCloseTo(2.58, 2);
        expect(r.final_pl).toBeCloseTo(-2.58, 2);
    });

    it('scales the stake up as the deficit grows', () => {
        // Deeper hole -> bigger stake. Three losses in a row must be strictly
        // increasing under deficit sizing.
        const r = runBacktest(px([0, 0, 0]), 2, deficit);
        expect(r.peak_stake).toBeGreaterThan(1);
        // 1.00, then ~1.58, then ~2.00 — each larger than the last.
        expect(r.total_staked).toBeGreaterThan(4);
        expect(r.longest_loss_streak).toBe(3);
    });

    it('returns to base stake once back above water', () => {
        // Win first (pl > 0) so there is no deficit; stake stays at base.
        const r = runBacktest(px([9, 9]), 2, deficit);
        expect(r.total_staked).toBeCloseTo(2, 2); // 1.00 + 1.00
    });

    it('clamps at max_stake and counts it, rather than chasing the deficit', () => {
        // Tiny ceiling forces the clamp immediately after the first loss.
        const r = runBacktest(px([0, 0, 0]), 2, { ...deficit, max_stake: 1.2 });
        expect(r.peak_stake).toBe(1.2);
        expect(r.cap_hits).toBeGreaterThan(0);
    });

    it('ignores multiplier and step cap in deficit mode', () => {
        // Same ticks, wildly different ladder settings -> identical result,
        // proving deficit sizing does not fall through to ladder logic.
        const a = runBacktest(px([0, 0, 0]), 2, { ...deficit, multiplier: 2, max_steps: 2 });
        const b = runBacktest(px([0, 0, 0]), 2, { ...deficit, multiplier: 9, max_steps: 0 });
        expect(a.total_staked).toBeCloseTo(b.total_staked, 6);
        expect(a.final_pl).toBeCloseTo(b.final_pl, 6);
    });

    it('does not divide by zero when the payout has no edge to give', () => {
        // payout_ratio 1 means profit_per_unit 0 — sizing is undefined, so it
        // must fall back to base rather than producing Infinity.
        const r = runBacktest(px([0, 0]), 2, { ...deficit, payout_ratio: 1 });
        expect(Number.isFinite(r.total_staked)).toBe(true);
        expect(r.total_staked).toBeCloseTo(2, 2);
    });

    it('leaves ladder mode behaviour unchanged', () => {
        // The original uncapped-ladder case must still give exactly 1+2+4.
        const r = runBacktest(px([0, 0, 0]), 2, base);
        expect(r.final_pl).toBe(-7);
        expect(r.peak_stake).toBe(4);
    });
});
