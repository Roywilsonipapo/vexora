import { api_base } from '@/external/bot-skeleton';
import { lastDigit } from '@/pages/market-analysis/tick-utils';
import type { TApiSend } from './api-types';

/**
 * Live digit stream for a synthetic index — reuses the existing, already
 * pip-size-correct lastDigit() from pages/market-analysis/tick-utils.ts
 * rather than re-deriving digit extraction here.
 */

export type TDigitListener = (digit: number, price: number, epoch: number) => void;

const MAX_BUFFER = 1000;

const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        const maybe_error = (err as { error?: { message?: string; code?: string } }).error;
        if (maybe_error?.message) return maybe_error.code ? `${maybe_error.message} (${maybe_error.code})` : maybe_error.message;
    }
    return fallback;
};

const STALE_AFTER_MS = 10000;

export class DigitFeed {
    symbol: string;
    digits: number[] = [];
    // Raw quotes alongside the derived digits — paper-mode settlement needs
    // an actual observed price to run through lastDigit() at exit time, not
    // just the pre-digested digit history.
    prices: number[] = [];
    pip_size = 2;

    private on_digit: TDigitListener;
    private message_subscription: { unsubscribe: () => void } | null = null;
    private subscription_id: string | null = null;
    private last_update_ms = 0;

    constructor(symbol: string, on_digit: TDigitListener) {
        this.symbol = symbol;
        this.on_digit = on_digit;
    }

    isStale(): boolean {
        if (!this.last_update_ms) return false;
        return Date.now() - this.last_update_ms > STALE_AFTER_MS;
    }

    async start(): Promise<void> {
        if (!api_base.api) throw new Error('Not connected.');

        this.message_subscription = api_base.api.onMessage().subscribe(({ data }: { data: Record<string, unknown> }) => {
            if (data.msg_type !== 'tick') return;
            const tick = data.tick as { symbol?: string; quote?: number | string; epoch?: number | string };
            if (tick?.symbol !== this.symbol) return;
            const quote = Number(tick.quote);
            const epoch = Number(tick.epoch);
            if (!Number.isFinite(quote)) return;
            const digit = lastDigit(quote, this.pip_size);
            this.digits = [...this.digits, digit].slice(-MAX_BUFFER);
            this.prices = [...this.prices, quote].slice(-MAX_BUFFER);
            this.last_update_ms = Date.now();
            this.on_digit(digit, quote, epoch);
        });

        let response;
        try {
            response = await api_base.api.send({
                ticks_history: this.symbol,
                subscribe: 1,
                end: 'latest',
                count: MAX_BUFFER,
                style: 'ticks',
            });
        } catch (err) {
            this.stop();
            throw new Error(describeError(err, 'Could not reach the digit feed.'));
        }
        if (response?.error) {
            this.stop();
            throw new Error(describeError(response, 'Deriv rejected the digit feed request.'));
        }

        this.pip_size = response?.pip_size ?? 2;
        const history_prices = response?.history?.prices;
        if (Array.isArray(history_prices)) {
            this.prices = history_prices.map(Number).slice(-MAX_BUFFER);
            this.digits = history_prices.map((p: string | number) => lastDigit(p, this.pip_size)).slice(-MAX_BUFFER);
        }
        this.last_update_ms = Date.now();
        this.subscription_id = response?.subscription?.id ?? null;
    }

    stop(): void {
        this.message_subscription?.unsubscribe();
        this.message_subscription = null;
        if (this.subscription_id) {
            (api_base.api as unknown as TApiSend<unknown> | null)
                ?.send({ forget: this.subscription_id })
                ?.catch(() => {
                    // best-effort — the connection may already be gone
                });
            this.subscription_id = null;
        }
    }
}
