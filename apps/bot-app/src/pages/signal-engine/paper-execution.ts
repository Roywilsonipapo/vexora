import { api_base } from '@/external/bot-skeleton';
import { isWin, TContract } from '@/pages/market-analysis/backtest-engine';
import { lastDigit } from '@/pages/market-analysis/tick-utils';
import { NEEDS_BARRIER, TContractType, TSettledContract } from './contract-execution';

/**
 * Paper/demo trading: prices the contract with a real `proposal` request
 * (real ask price, real payout — no money moves), then waits for the real
 * feed to actually reach the trade's duration before reading the exit
 * price/digit, exactly as a live contract would settle. Nothing here is
 * invented — the only difference from a live trade is that no `buy` is
 * ever sent.
 */

const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        const maybe_error = (err as { error?: { message?: string; code?: string } }).error;
        if (maybe_error?.message) return maybe_error.code ? `${maybe_error.message} (${maybe_error.code})` : maybe_error.message;
    }
    return fallback;
};

export type TProposalQuote = { ask_price: number; payout: number; spot: number };

export const fetchProposal = async (params: {
    contract_type: TContractType;
    symbol: string;
    stake: number;
    duration: number;
    duration_unit: string;
    currency: string;
    barrier?: number;
}): Promise<TProposalQuote> => {
    if (!api_base.api) throw new Error('Not connected.');

    const request: Record<string, unknown> = {
        proposal: 1,
        amount: params.stake,
        basis: 'stake',
        contract_type: params.contract_type,
        currency: params.currency,
        duration: params.duration,
        duration_unit: params.duration_unit,
        // NOT `symbol` — confirmed live against this app's actual Trading API
        // connection (api_base) that it rejects that field with
        // InputValidationFailed. tradeOptionToProposal in bot-skeleton's own
        // helpers.js (the app's real, working proposal flow) uses
        // underlying_symbol, so this matches the connection's real schema
        // rather than Deriv's classic-API docs.
        underlying_symbol: params.symbol,
    };
    if (NEEDS_BARRIER.includes(params.contract_type) && params.barrier !== undefined) {
        request.barrier = String(params.barrier);
    }

    let response;
    try {
        response = await api_base.api.send(request);
    } catch (err) {
        throw new Error(describeError(err, 'Could not price this contract.'));
    }
    if (response?.error) throw new Error(describeError(response, 'Deriv rejected the pricing request.'));

    const proposal = response?.proposal;
    if (!proposal?.payout || !proposal?.ask_price) throw new Error('Deriv did not return a usable quote.');

    return {
        ask_price: Number(proposal.ask_price),
        payout: Number(proposal.payout),
        spot: Number(proposal.spot) || 0,
    };
};

const DURATION_UNIT_MS: Record<string, number> = { s: 1000, m: 60000, h: 3_600_000, d: 86_400_000 };
const POLL_INTERVAL_MS = 200;
const MAX_WAIT_MULTIPLIER = 4;

/**
 * Polls a live feed until `duration` has genuinely elapsed — real ticks for
 * duration_unit 't', real wall-clock time otherwise — then returns the
 * actually observed value. Throws rather than guessing if the feed goes
 * quiet well past the expected wait.
 */
const waitForRealOutcome = (params: {
    duration: number;
    duration_unit: string;
    getElapsedTicks?: () => number;
    getCurrentValue: () => number;
}): Promise<number> => {
    const start = Date.now();
    const start_ticks = params.getElapsedTicks?.() ?? 0;
    const expected_ms =
        params.duration_unit === 't' ? params.duration * 2000 : (DURATION_UNIT_MS[params.duration_unit] ?? 1000) * params.duration;
    const max_wait_ms = Math.max(expected_ms * MAX_WAIT_MULTIPLIER, 10000);

    return new Promise((resolve, reject) => {
        const check = () => {
            const elapsed_ms = Date.now() - start;
            const done =
                params.duration_unit === 't'
                    ? (params.getElapsedTicks?.() ?? 0) - start_ticks >= params.duration
                    : elapsed_ms >= expected_ms;

            if (done) {
                resolve(params.getCurrentValue());
                return;
            }
            if (elapsed_ms >= max_wait_ms) {
                reject(new Error('Price feed went quiet — could not observe a real settlement.'));
                return;
            }
            setTimeout(check, POLL_INTERVAL_MS);
        };
        check();
    });
};

export const simulatePaperTrade = async (params: {
    contract_type: TContractType;
    symbol: string;
    stake: number;
    duration: number;
    duration_unit: string;
    currency: string;
    barrier?: number;
    entry_value: number;
    getElapsedTicks?: () => number;
    getCurrentValue: () => number;
    pip_size?: number;
}): Promise<TSettledContract> => {
    const quote = await fetchProposal(params);
    const exit_price = await waitForRealOutcome({
        duration: params.duration,
        duration_unit: params.duration_unit,
        getElapsedTicks: params.getElapsedTicks,
        getCurrentValue: params.getCurrentValue,
    });

    let won: boolean;
    if (params.contract_type === 'CALL') {
        won = exit_price > params.entry_value;
    } else if (params.contract_type === 'PUT') {
        won = exit_price < params.entry_value;
    } else {
        const exit_digit = lastDigit(exit_price, params.pip_size ?? 2);
        won = isWin(exit_digit, params.contract_type as TContract, params.barrier ?? 0);
    }

    const profit = won ? quote.payout - quote.ask_price : -quote.ask_price;

    return {
        // Negative/synthetic id marks this as a paper trade — never collides
        // with a real Deriv contract_id, which is always positive.
        contract_id: -Date.now(),
        won,
        profit,
        entry_spot: params.entry_value,
        exit_spot: exit_price,
    };
};
