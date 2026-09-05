import { api_base } from '@/external/bot-skeleton';
// eslint-disable-next-line import/no-unresolved -- vendored JS helper, no types
import { tradeOptionToBuy } from '@/external/bot-skeleton/services/tradeEngine/utils/helpers';
import type { TContract } from '@/pages/market-analysis/backtest-engine';
import type { TApiSend } from './api-types';

type TSubscribeResponse = { error?: { message?: string; code?: string }; subscription?: { id?: string } };
const asApi = () => api_base.api as unknown as TApiSend<TSubscribeResponse> | null;

/**
 * Places a contract — Rise/Fall (CALL/PUT) or a Digits contract — and
 * tracks its own settlement, independent of the Blockly trade engine and
 * the app's global proposal_open_contract stream (used by the run panel /
 * transactions store). Cleanup uses the scoped `forget` (by this
 * subscription's own id), never `forget_all` — that would also kill the
 * global stream every regular bot trade relies on.
 */

export type TContractType = 'CALL' | 'PUT' | TContract;

// Matches fetch-payout.ts's NEEDS_BARRIER list — EVEN/ODD and CALL/PUT don't
// take one, and sending one makes those calls fail.
export const NEEDS_BARRIER: TContractType[] = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];

export type TSettledContract = {
    contract_id: number;
    won: boolean;
    profit: number;
    entry_spot: number;
    exit_spot: number;
};

const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        const maybe_error = (err as { error?: { message?: string; code?: string } }).error;
        if (maybe_error?.message) return maybe_error.code ? `${maybe_error.message} (${maybe_error.code})` : maybe_error.message;
    }
    return fallback;
};

export const placeContract = async (params: {
    contract_type: TContractType;
    symbol: string;
    stake: number;
    duration: number;
    duration_unit: string;
    currency: string;
    barrier?: number;
}): Promise<{ contract_id: number; buy_price: number }> => {
    if (!api_base.api) throw new Error('Not connected.');

    const trade_option: Record<string, unknown> = {
        amount: params.stake,
        basis: 'stake',
        duration: params.duration,
        duration_unit: params.duration_unit,
        currency: params.currency,
        symbol: params.symbol,
    };
    if (NEEDS_BARRIER.includes(params.contract_type) && params.barrier !== undefined) {
        trade_option.prediction = params.barrier;
    }
    const buy_request = tradeOptionToBuy(params.contract_type, trade_option);

    let response;
    try {
        response = await api_base.api.send(buy_request);
    } catch (err) {
        throw new Error(describeError(err, 'Could not place the trade.'));
    }
    if (response?.error) throw new Error(describeError(response, 'Deriv rejected the trade.'));

    const contract_id = response?.buy?.contract_id;
    if (!contract_id) throw new Error('Deriv did not return a contract id for this trade.');

    return { contract_id, buy_price: Number(response?.buy?.buy_price) || params.stake };
};

/**
 * Calls onSettled exactly once, when the contract is actually sold/expired.
 * Returns a cleanup function — always call it, whether or not settlement
 * ever arrived, to release the scoped subscription.
 */
export const watchContractSettlement = (
    contract_id: number,
    onSettled: (result: TSettledContract) => void,
    onError: (message: string) => void
): (() => void) => {
    let subscription_id: string | null = null;
    let settled = false;

    const message_subscription = api_base.api?.onMessage().subscribe(({ data }: { data: Record<string, unknown> }) => {
        if (settled || data.msg_type !== 'proposal_open_contract') return;
        const contract = data.proposal_open_contract as Record<string, unknown> | undefined;
        if (!contract || Number(contract.contract_id) !== contract_id) return;
        if (!contract.is_sold && !contract.is_expired) return;

        settled = true;
        const profit = Number(contract.profit) || 0;
        const entry_spot = Number(contract.entry_spot ?? contract.entry_tick) || 0;
        const exit_spot = Number(contract.exit_spot ?? contract.exit_tick) || 0;
        onSettled({
            contract_id,
            won: profit > 0,
            profit,
            entry_spot,
            exit_spot,
        });
    });

    const api = asApi();
    if (!api) {
        onError('Not connected.');
    } else {
        api.send({ proposal_open_contract: 1, contract_id, subscribe: 1 })
            .then(response => {
                if (response?.error) {
                    onError(describeError(response, 'Could not track this trade.'));
                    return;
                }
                subscription_id = response?.subscription?.id ?? null;
            })
            .catch((err: unknown) => onError(describeError(err, 'Could not track this trade.')));
    }

    return () => {
        message_subscription?.unsubscribe();
        if (subscription_id) {
            asApi()
                ?.send({ forget: subscription_id })
                ?.catch(() => {
                    // best-effort — the connection may already be gone
                });
        }
    };
};
