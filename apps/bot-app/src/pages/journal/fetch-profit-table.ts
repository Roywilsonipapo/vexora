import { api_base } from '@/external/bot-skeleton';

/**
 * Real, server-side profit history for the currently authorized account.
 *
 * This replaces reading transactions_store (see the removed first version of
 * this page): the run panel's Reset button calls transactions.clear()
 * directly, wiping that local cache — so a Journal built on it lost its data
 * the moment anyone reset the run panel. profit_table is Deriv's own ledger.
 * It is not affected by anything in this app's UI, because it lives on their
 * server, not in this browser.
 *
 * One real limit, inherent to how this app authorizes: it holds one account
 * token at a time, so this can only ever return data for whichever account
 * is CURRENTLY active. There is no way to fetch demo and real simultaneously
 * without an actual account switch, and switching accounts mid-session risks
 * disrupting a running bot — so this is not attempted here. The caller shows
 * whichever account is active, labelled, and refetches when it changes.
 */

export type TProfitEntry = {
    buy_price: number;
    sell_price: number;
    profit: number;
    sell_time: number; // epoch seconds
    contract_type?: string;
};

type TProfitTableResponse = {
    profit_table?: {
        count?: number;
        transactions?: {
            buy_price?: number;
            sell_price?: number;
            sell_time?: number | null;
            contract_type?: string;
        }[];
    };
    error?: { message?: string };
};

const PAGE_SIZE = 50;
// Bounds worst-case latency (and worst-case request count) for an account
// that has traded heavily this month, at 60 trades/minute a single busy day
// can already exceed this. If the cap is hit the caller is told so, rather
// than silently showing a partial total as if it were complete.
const MAX_PAGES = 20;

export const fetchMonthProfitTable = async (
    monthStartEpoch: number
): Promise<{ entries: TProfitEntry[]; truncated: boolean } | { error: string }> => {
    if (!api_base?.api) return { error: 'Not connected to Deriv yet.' };

    const entries: TProfitEntry[] = [];
    let offset = 0;
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page++) {
        let res: TProfitTableResponse | undefined;
        try {
            res = (await api_base.api.send({
                profit_table: 1,
                date_from: monthStartEpoch,
                date_to: Math.floor(Date.now() / 1000),
                limit: PAGE_SIZE,
                offset,
                sort: 'ASC',
            })) as unknown as TProfitTableResponse;
        } catch {
            return { error: 'Could not reach Deriv to load the profit table.' };
        }

        if (res?.error) return { error: res.error.message || 'Deriv rejected the request.' };

        const batch = res?.profit_table?.transactions ?? [];
        batch.forEach(t => {
            const buy = Number(t.buy_price) || 0;
            const sell = Number(t.sell_price) || 0;
            // sell_time null means the contract has not settled yet — no
            // profit to attribute until it does.
            if (t.sell_time == null) return;
            entries.push({
                buy_price: buy,
                sell_price: sell,
                profit: +(sell - buy).toFixed(2),
                sell_time: t.sell_time,
                contract_type: t.contract_type,
            });
        });

        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        if (page === MAX_PAGES - 1) truncated = true;
    }

    return { entries, truncated };
};

export default fetchMonthProfitTable;
