import { lastDigit } from './tick-utils';

/**
 * Replays a staking plan over real historical ticks.
 *
 * This answers "what would this bot have done on the last N ticks of this
 * market", using the actual digits that occurred and the actual payout ratio
 * from the API. It is a record of the past, not a forecast — synthetic indices
 * are random per tick, so a good result here says nothing about the next tick.
 * The UI must not present it as a prediction.
 *
 * Deliberately pure: no network, no React, no clock. Everything it needs is an
 * argument, so the maths can be checked directly.
 */

export type TContract = 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'DIGITMATCH' | 'DIGITDIFF';

/**
 * How the next stake is chosen.
 *
 * `ladder` — classic escalation: multiply after a loss, reset on a win or at
 * the step cap.
 *
 * `deficit` — size to the shortfall that actually exists, the way the Deficit
 * Recovery Engine bot does. A flat base stake cannot repay a deficit, because
 * what repays it is profit per unit staked, not the number of trades. Stake is
 * whatever clears the current shortfall plus the target over N wins, clamped
 * to a ceiling.
 */
export type TStakingMode = 'ladder' | 'deficit';

export type TBacktestConfig = {
    contract: TContract;
    barrier: number;
    base_stake: number;
    staking?: TStakingMode;
    /** deficit mode: spread recovery across this many wins rather than chasing it in one. */
    recover_over_wins?: number;
    /** deficit mode: hard ceiling on a single stake. This is what bounds the tail. */
    max_stake?: number;
    multiplier: number;
    /**
     * Steps of escalation allowed before the ladder resets to base.
     * 0 means UNCAPPED — the ladder keeps climbing, which is the case worth
     * modelling because it is how martingale accounts actually die.
     * For flat staking set multiplier to 1.
     */
    max_steps: number;
    /** Session stop as a positive number of currency units of loss. */
    session_loss: number;
    /** Session take profit in currency units. 0 disables. */
    take_profit: number;
    /** payout / stake for a win, from the API. 1.9 means a 1 USD win returns 1.90. */
    payout_ratio: number;
};

export type TBacktestResult = {
    trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    final_pl: number;
    peak_pl: number;
    max_drawdown: number;
    longest_loss_streak: number;
    peak_stake: number;
    total_staked: number;
    cap_hits: number;
    stopped_reason: 'session_loss' | 'take_profit' | 'ran_out_of_ticks';
    /** Running P/L after each trade, for the equity curve. */
    equity: number[];
};

const isWin = (digit: number, contract: TContract, barrier: number): boolean => {
    switch (contract) {
        case 'DIGITOVER':
            return digit > barrier;
        case 'DIGITUNDER':
            return digit < barrier;
        case 'DIGITEVEN':
            return digit % 2 === 0;
        case 'DIGITODD':
            return digit % 2 === 1;
        case 'DIGITMATCH':
            return digit === barrier;
        case 'DIGITDIFF':
            return digit !== barrier;
        default:
            return false;
    }
};

export const runBacktest = (
    prices: (string | number)[],
    pip_size: number,
    config: TBacktestConfig
): TBacktestResult => {
    const {
        contract,
        barrier,
        base_stake,
        multiplier,
        max_steps,
        session_loss,
        take_profit,
        payout_ratio,
        staking = 'ladder',
        recover_over_wins = 4,
        max_stake = 25,
    } = config;

    // Profit per unit staked, derived from the real payout rather than taken
    // as a separate setting. The bot has to be told this number by hand; here
    // we already know the true payout, so deriving it keeps the two in step.
    const profit_per_unit = payout_ratio - 1;

    let stake = base_stake;
    let steps = 0;
    let pl = 0;
    let peak_pl = 0;
    let max_drawdown = 0;
    let wins = 0;
    let losses = 0;
    let streak = 0;
    let longest_loss_streak = 0;
    let peak_stake = base_stake;
    let total_staked = 0;
    let cap_hits = 0;
    let stopped_reason: TBacktestResult['stopped_reason'] = 'ran_out_of_ticks';
    const equity: number[] = [];

    for (let i = 0; i < prices.length; i++) {
        const digit = lastDigit(prices[i], pip_size);
        const won = isWin(digit, contract, barrier);

        total_staked += stake;
        peak_stake = Math.max(peak_stake, stake);

        if (won) {
            // Profit on a win is the payout minus the stake that bought it.
            pl += stake * (payout_ratio - 1);
            wins++;
            streak = 0;
            if (staking === 'ladder') {
                stake = base_stake;
                steps = 0;
            }
        } else {
            pl -= stake;
            losses++;
            streak++;
            longest_loss_streak = Math.max(longest_loss_streak, streak);
            if (staking === 'ladder') {
                steps++;
                if (max_steps > 0 && steps >= max_steps) {
                    // Cap reached: back to base rather than climbing further.
                    // This is the difference between a bounded ladder and a
                    // blow-up.
                    stake = base_stake;
                    steps = 0;
                    cap_hits++;
                } else {
                    stake = stake * multiplier;
                }
            }
        }

        if (staking === 'deficit') {
            // Size to the shortfall that actually exists. Once back above
            // water there is nothing to recover, so drop to base.
            if (pl < 0 && profit_per_unit > 0) {
                const target = take_profit > 0 ? take_profit : base_stake;
                const needed = (target - pl) / (recover_over_wins * profit_per_unit);
                // The ceiling is the whole point: past it the bot stops
                // chasing the full deficit. Count those as cap hits so the
                // result shows how often the tail was being clipped.
                if (needed > max_stake) {
                    stake = max_stake;
                    cap_hits++;
                } else {
                    stake = needed;
                }
            } else {
                stake = base_stake;
            }
        }

        peak_pl = Math.max(peak_pl, pl);
        // Drawdown measured from the session's own high-water mark, which is
        // what actually hurts — not distance from zero.
        max_drawdown = Math.max(max_drawdown, peak_pl - pl);
        equity.push(+pl.toFixed(2));

        if (take_profit > 0 && pl >= take_profit) {
            stopped_reason = 'take_profit';
            break;
        }
        if (session_loss > 0 && pl <= -session_loss) {
            stopped_reason = 'session_loss';
            break;
        }
    }

    const trades = wins + losses;
    return {
        trades,
        wins,
        losses,
        win_rate: trades ? +((wins / trades) * 100).toFixed(2) : 0,
        final_pl: +pl.toFixed(2),
        peak_pl: +peak_pl.toFixed(2),
        max_drawdown: +max_drawdown.toFixed(2),
        longest_loss_streak,
        peak_stake: +peak_stake.toFixed(2),
        total_staked: +total_staked.toFixed(2),
        cap_hits,
        stopped_reason,
        equity,
    };
};

export default runBacktest;
