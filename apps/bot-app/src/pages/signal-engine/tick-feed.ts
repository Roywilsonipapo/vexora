import { api_base } from '@/external/bot-skeleton';
import type { TApiSend } from './api-types';

/**
 * Live price feed for a single real-market symbol (e.g. "frxEURUSD"), used
 * only by the signal engine — separate from the chart/smartcharts tick
 * service, which caches ticks for a different purpose (rendering) and isn't
 * safely reusable here.
 *
 * `ticks_history` with subscribe:1 seeds the price buffer AND opens the live
 * stream in one call; deriv-api resolves the promise with the initial
 * history batch, then keeps delivering `tick` messages on the raw message
 * bus, matched here by symbol rather than by subscription id (single-symbol
 * use, so a symbol match is unambiguous).
 */

export type TTickListener = (price: number, epoch: number) => void;

const MAX_BUFFER = 200;

const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        const maybe_error = (err as { error?: { message?: string; code?: string } }).error;
        if (maybe_error?.message) return maybe_error.code ? `${maybe_error.message} (${maybe_error.code})` : maybe_error.message;
    }
    return fallback;
};

export class TickFeed {
    symbol: string;
    prices: number[] = [];

    private on_tick: TTickListener;
    private message_subscription: { unsubscribe: () => void } | null = null;
    private subscription_id: string | null = null;

    constructor(symbol: string, on_tick: TTickListener) {
        this.symbol = symbol;
        this.on_tick = on_tick;
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
            this.prices = [...this.prices, quote].slice(-MAX_BUFFER);
            this.on_tick(quote, epoch);
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
            throw new Error(describeError(err, 'Could not reach the price feed.'));
        }

        if (response?.error) {
            this.stop();
            throw new Error(describeError(response, 'Deriv rejected the price feed request.'));
        }

        const history_prices = response?.history?.prices;
        if (Array.isArray(history_prices)) {
            this.prices = history_prices.map(Number).slice(-MAX_BUFFER);
        }
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
