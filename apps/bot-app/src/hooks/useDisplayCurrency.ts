import { useCallback, useEffect, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';

/**
 * Display-only currency conversion for the balance readout.
 *
 * The Deriv account itself is always in its own currency — this converts what
 * is SHOWN, nothing else. Stakes, payouts and the actual balance are untouched.
 * That distinction has to survive into the UI, or a converted figure reads as
 * if the account holds that currency.
 *
 * Rates come from Deriv's own `exchange_rates` call rather than a third-party
 * FX API: no key, no CORS, no extra dependency, and it's the same source the
 * rest of the platform prices against.
 *
 * If rates are unavailable the hook reports `null` and callers fall back to the
 * real currency. It never returns a stale or guessed rate — a wrong number on a
 * balance is worse than no conversion.
 */

export const DISPLAY_CURRENCIES = ['USD', 'KES', 'EUR', 'GBP', 'AUD'] as const;
export type TDisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

const STORAGE_KEY = 'vx_display_currency';
// Rates move slowly enough that a 10-minute cache is plenty, and it keeps us
// off the API on every dropdown open.
const REFRESH_MS = 10 * 60 * 1000;

const readStored = (): TDisplayCurrency => {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return DISPLAY_CURRENCIES.includes(v as TDisplayCurrency) ? (v as TDisplayCurrency) : 'USD';
    } catch {
        return 'USD';
    }
};

export const useDisplayCurrency = () => {
    const [display_currency, setDisplayCurrencyState] = useState<TDisplayCurrency>(readStored);
    const [rates, setRates] = useState<Record<string, number> | null>(null);

    const setDisplayCurrency = useCallback((next: TDisplayCurrency) => {
        setDisplayCurrencyState(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Private mode or blocked storage — the selection just won't persist.
        }
    }, []);

    useEffect(() => {
        let is_mounted = true;

        // `api_base.api` does not exist yet on a cold load — the socket is still
        // being set up when the header first mounts. Firing immediately loses
        // that race and leaves rates permanently null, which is what made the
        // converter look broken: it silently sat on "rates unavailable" forever
        // because nothing ever retried.
        const waitForApi = async (timeout_ms = 8000) => {
            const start = Date.now();
            while (!api_base?.api) {
                if (Date.now() - start > timeout_ms) return false;
                await new Promise(res => setTimeout(res, 200));
            }
            return true;
        };

        const fetchOnce = async () => {
            // api_base.send is typed as returning void upstream, but it
            // resolves with the API payload — hence the cast.
            const res = (await api_base.api?.send({
                exchange_rates: 1,
                base_currency: 'USD',
            })) as unknown as { exchange_rates?: { rates?: Record<string, number> } } | undefined;
            return res?.exchange_rates?.rates ?? null;
        };

        const load = async () => {
            if (!(await waitForApi())) return;
            // Even with the socket up the first call can land mid-reconnect, so
            // back off and retry rather than giving up on one failure.
            for (let attempt = 0; attempt < 3 && is_mounted; attempt++) {
                if (attempt > 0) await new Promise(res => setTimeout(res, 800 * attempt));
                try {
                    const next = await fetchOnce();
                    if (!is_mounted) return;
                    if (next) {
                        setRates(next);
                        return;
                    }
                } catch {
                    // Try again; the loop bounds how long we keep trying.
                }
            }
        };

        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            is_mounted = false;
            clearInterval(id);
        };
    }, []);

    /**
     * Convert an amount held in `from_currency` into the selected display
     * currency. Returns null when no honest conversion is possible, so callers
     * can fall back rather than render a wrong figure.
     */
    const convert = useCallback(
        (amount: number, from_currency: string): number | null => {
            if (!display_currency || display_currency === from_currency) return null;
            if (!rates) return null;

            // Rates are quoted against USD. Anything not priced in USD has to be
            // normalised through it first, and that only works if we hold a rate
            // for the source currency too.
            let usd_amount = amount;
            if (from_currency !== 'USD') {
                const from_rate = rates[from_currency];
                if (!from_rate) return null;
                usd_amount = amount / from_rate;
            }

            if (display_currency === 'USD') return usd_amount;
            const to_rate = rates[display_currency];
            if (!to_rate) return null;
            return usd_amount * to_rate;
        },
        [display_currency, rates]
    );

    const format = useCallback((amount: number, currency: string) => {
        // KES figures get large; 2dp on a six-figure number is noise.
        const decimals = amount >= 10000 ? 0 : 2;
        return `${amount.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        })} ${currency}`;
    }, []);

    return { display_currency, setDisplayCurrency, convert, format, has_rates: !!rates };
};

export default useDisplayCurrency;
