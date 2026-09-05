/**
 * Standalone risk engine — the execution layer must consult
 * checkCanTrade() before every single trade, not just at arm-time. It can
 * veto a signal outright regardless of how confident the model is.
 *
 * Deliberately does not know about stakes changing after a loss — there is
 * no "recover the deficit" logic anywhere in here. Stake is whatever the
 * caller configured; this module only ever compares it against a fixed
 * ceiling and refuses trades, it never resizes one.
 */

export type TRiskConfig = {
    max_stake: number;
    max_daily_loss: number;
    max_consecutive_losses: number;
    max_trades_per_day: number;
    cooldown_seconds: number;
};

export type TRiskState = {
    trades_today: number;
    daily_pl: number;
    consecutive_losses: number;
    last_trade_time_ms: number;
    emergency_stopped: boolean;
};

export type TRiskCheck = { allowed: boolean; reason?: string };

export const DEFAULT_RISK_CONFIG: TRiskConfig = {
    max_stake: 10,
    max_daily_loss: 50,
    max_consecutive_losses: 3,
    max_trades_per_day: 100,
    cooldown_seconds: 5,
};

export class RiskEngine {
    config: TRiskConfig;
    state: TRiskState;
    private day_key: string;

    constructor(config: TRiskConfig = DEFAULT_RISK_CONFIG) {
        this.config = config;
        this.day_key = new Date().toDateString();
        this.state = {
            trades_today: 0,
            daily_pl: 0,
            consecutive_losses: 0,
            last_trade_time_ms: 0,
            emergency_stopped: false,
        };
    }

    private rolloverDayIfNeeded(): void {
        const today = new Date().toDateString();
        if (today !== this.day_key) {
            this.day_key = today;
            this.state.trades_today = 0;
            this.state.daily_pl = 0;
        }
    }

    checkCanTrade(stake: number): TRiskCheck {
        this.rolloverDayIfNeeded();
        if (this.state.emergency_stopped) return { allowed: false, reason: 'Emergency stop is active.' };
        if (stake > this.config.max_stake) {
            return { allowed: false, reason: `Stake exceeds max risk per trade (${this.config.max_stake}).` };
        }
        if (this.state.daily_pl <= -this.config.max_daily_loss) {
            return { allowed: false, reason: 'Max daily loss reached.' };
        }
        if (this.state.consecutive_losses >= this.config.max_consecutive_losses) {
            return { allowed: false, reason: 'Max consecutive losses reached.' };
        }
        if (this.state.trades_today >= this.config.max_trades_per_day) {
            return { allowed: false, reason: 'Max trades for the day reached.' };
        }
        if (this.state.last_trade_time_ms) {
            const elapsed_s = (Date.now() - this.state.last_trade_time_ms) / 1000;
            if (elapsed_s < this.config.cooldown_seconds) {
                return { allowed: false, reason: `Cooldown active — ${Math.ceil(this.config.cooldown_seconds - elapsed_s)}s remaining.` };
            }
        }
        return { allowed: true };
    }

    recordTrade(profit: number): void {
        this.rolloverDayIfNeeded();
        this.state.trades_today += 1;
        this.state.daily_pl += profit;
        this.state.last_trade_time_ms = Date.now();
        if (profit > 0) this.state.consecutive_losses = 0;
        else this.state.consecutive_losses += 1;
    }

    emergencyStop(): void {
        this.state.emergency_stopped = true;
    }

    /** A fresh arm is a deliberate new decision — clears a losing streak's
     *  block, but daily-loss/trade-count limits stay tied to the calendar
     *  day regardless, so this can't be used to bypass those. */
    clearConsecutiveLosses(): void {
        this.state.consecutive_losses = 0;
    }

    clearEmergencyStop(): void {
        this.state.emergency_stopped = false;
    }

    resetSession(): void {
        this.state = {
            trades_today: 0,
            daily_pl: 0,
            consecutive_losses: 0,
            last_trade_time_ms: 0,
            emergency_stopped: false,
        };
    }
}
