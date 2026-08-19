// Shared tick-data helpers for the Analysis Tool (Circles view + Signal Scanner).
// Everything here talks to the real Deriv API via api_base — there is no
// simulated or sample data anywhere in this module.
import { api_base } from '@/external/bot-skeleton';

export type TSymbol = { code: string; label: string };

export const SYMBOLS: TSymbol[] = [
    { code: 'R_10', label: 'Volatility 10 Index' },
    { code: 'R_25', label: 'Volatility 25 Index' },
    { code: 'R_50', label: 'Volatility 50 Index' },
    { code: 'R_75', label: 'Volatility 75 Index' },
    { code: 'R_100', label: 'Volatility 100 Index' },
];

export const TICK_COUNT = 200;

type TTickHistoryResponse = {
    history?: { prices: string[]; times: number[] };
    pip_size?: number;
    error?: { message: string };
};

/**
 * Last digit of a quote, padded to the symbol's pip size.
 *
 * Both details matter: the API returns `prices` as numbers (not strings), and
 * it drops trailing zeros — 580.9 on a 2dp symbol is really 580.90, whose last
 * digit is 0, not 9. Getting either wrong skews every digit statistic.
 */
export const lastDigit = (price: string | number, pip_size: number) => {
    const n = Number(price);
    if (!Number.isFinite(n)) return 0;
    // toFixed throws a RangeError outside 0-100, which would take down the
    // whole tab from inside a render. Clamp instead.
    const dp = Number.isFinite(pip_size) ? Math.min(Math.max(Math.trunc(pip_size), 0), 100) : 2;
    const s = n.toFixed(dp);
    return Number(s.charAt(s.length - 1));
};

export const waitForApi = async (timeoutMs = 6000): Promise<boolean> => {
    const start = Date.now();
    while (!api_base?.api) {
        if (Date.now() - start > timeoutMs) return false;
        await new Promise(r => setTimeout(r, 200));
    }
    return true;
};

// The vendored TApiBaseApi types `send` as returning void, so every caller has
// to assert the real response shape. Cast the API OBJECT rather than pulling
// `send` off it — a detached reference loses its `this` binding and the call
// fails at runtime.
type TApi = { send: (request: Record<string, unknown>) => Promise<TTickHistoryResponse> };

export const fetchTickHistory = async (
    symbol: string,
    count: number = TICK_COUNT
): Promise<{ prices: string[]; pip_size: number } | null> => {
    const ready = await waitForApi();
    if (!ready || !api_base?.api) return null;
    try {
        const api = api_base.api as unknown as TApi;
        const response = await api.send({
            ticks_history: symbol,
            count,
            end: 'latest',
            style: 'ticks',
        });
        if (response?.error) return null;
        const prices = response?.history?.prices;
        if (!prices) return null;
        return { prices, pip_size: response?.pip_size ?? 2 };
    } catch {
        return null;
    }
};

/** Digit frequency counts (index 0-9) for a price series. */
export const digitCountsFor = (prices: (string | number)[], pip_size: number) => {
    const counts = Array(10).fill(0) as number[];
    prices.forEach(p => counts[lastDigit(p, pip_size)]++);
    return counts;
};
