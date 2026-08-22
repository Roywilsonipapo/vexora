import { api_base } from '@/external/bot-skeleton';
import type { TContract } from './backtest-engine';
import { waitForApi } from './tick-utils';

/**
 * Asks Deriv what a contract actually pays, so the backtest runs on the real
 * payout rather than a guessed one.
 *
 * Returns null when it cannot get a real figure — the caller must then ask the
 * user rather than substituting a plausible-looking number. A backtest built on
 * an invented payout produces confident, wrong P/L, which is worse than no
 * backtest at all.
 */

// Contracts whose proposal needs a barrier. EVEN/ODD do not take one, and
// sending one makes the call fail.
const NEEDS_BARRIER: TContract[] = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'];

type TProposalResponse = {
    proposal?: { payout?: number; ask_price?: number };
    error?: { message?: string; code?: string };
};

export const fetchPayoutRatio = async (
    symbol: string,
    contract: TContract,
    barrier: number,
    currency = 'USD'
): Promise<{ ratio: number } | { error: string }> => {
    const ready = await waitForApi();
    if (!ready || !api_base?.api) return { error: 'Not connected to Deriv yet.' };

    const request: Record<string, unknown> = {
        proposal: 1,
        amount: 1,
        basis: 'stake',
        contract_type: contract,
        currency,
        duration: 1,
        duration_unit: 't',
        symbol,
    };
    if (NEEDS_BARRIER.includes(contract)) request.barrier = String(barrier);

    try {
        const res = (await api_base.api.send(request)) as unknown as TProposalResponse;
        if (res?.error) return { error: res.error.message || 'Deriv rejected the request.' };
        const payout = res?.proposal?.payout;
        const ask = res?.proposal?.ask_price;
        if (!payout || !ask) return { error: 'Deriv did not return a payout for this contract.' };
        return { ratio: +(payout / ask).toFixed(4) };
    } catch {
        return { error: 'Could not reach Deriv to price this contract.' };
    }
};

export default fetchPayoutRatio;
