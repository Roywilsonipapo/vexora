/**
 * Auto-Runner decision engine.
 *
 * Pure and framework-free by design, same reasoning as backtest-engine.ts:
 * this decides whether to press Run again or stop for the day, and that
 * decision should be checkable without mobx, React, or a live Deriv session
 * in the loop. The React layer (index.tsx) owns pressing the real buttons and
 * reading real store state; this module only decides what should happen
 * given the numbers it's handed.
 */

export type TCycleOutcome = {
    /** This cycle's total profit/loss, from transactions_store.statistics.total_profit
     *  read immediately after the run stops and before it is reset. */
    cycle_profit: number;
};

export type TDailyTargets = {
    /** Positive number of currency units. 0 disables the daily profit stop. */
    daily_profit_target: number;
    /** Positive number of currency units. 0 disables the daily loss stop. */
    daily_loss_limit: number;
};

export type TDailyState = {
    /** Sum of every completed cycle's profit today, INCLUDING cycles from
     *  before the auto-runner was started (seeded from the real Journal). */
    cumulative_profit: number;
    cycles_completed: number;
};

export type TDecision =
    | { action: 'restart'; reason: 'cycle_profit' | 'cycle_loss'; daily_state: TDailyState }
    | { action: 'stop'; reason: 'daily_profit_target' | 'daily_loss_limit'; daily_state: TDailyState };

/**
 * Given the outcome of a cycle that just ended, decide what happens next.
 *
 * Daily targets are checked BEFORE deciding to restart on this cycle's own
 * result — a cycle that ends in profit but pushes the day's total over the
 * daily target should stop, not restart once more first.
 */
export const decideNextAction = (
    outcome: TCycleOutcome,
    targets: TDailyTargets,
    prior_daily_state: TDailyState
): TDecision => {
    const daily_state: TDailyState = {
        cumulative_profit: +(prior_daily_state.cumulative_profit + outcome.cycle_profit).toFixed(2),
        cycles_completed: prior_daily_state.cycles_completed + 1,
    };

    if (targets.daily_profit_target > 0 && daily_state.cumulative_profit >= targets.daily_profit_target) {
        return { action: 'stop', reason: 'daily_profit_target', daily_state };
    }

    if (targets.daily_loss_limit > 0 && daily_state.cumulative_profit <= -targets.daily_loss_limit) {
        return { action: 'stop', reason: 'daily_loss_limit', daily_state };
    }

    return {
        action: 'restart',
        reason: outcome.cycle_profit > 0 ? 'cycle_profit' : 'cycle_loss',
        daily_state,
    };
};

export default decideNextAction;
