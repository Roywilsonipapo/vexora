import { api_base } from '@/external/bot-skeleton';
import type { TApiSend } from './api-types';
import { TCandle } from './technical-indicators';

/**
 * Live OHLC candle feed for a single real-market symbol. Separate from
 * tick-feed.ts (which tracks raw price ticks for the live price readout and
 * paper-trade exit lookups) because indicators here need real candle
 * open/high/low/close, not a tick stream.
 *
 * Deriv sends the forming candle repeatedly as it updates (same epoch) and
 * a new one once it closes — handled here by replacing the last candle when
 * the epoch matches, pushing a new one otherwise.
 */

export type TCandleListener = (candles: TCandle[]) => void;

const MAX_BUFFER = 300;
const STALE_MULTIPLIER = 3; // no update for 3 granularities in a row = feed considered stale

const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        const maybe_error = (err as { error?: { message?: string; code?: string } }).error;
        if (maybe_error?.message) return maybe_error.code ? `${maybe_error.message} (${maybe_error.code})` : maybe_error.message;
    }
    return fallback;
};

export class CandleFeed {
    symbol: string;
    granularity: number;
    candles: TCandle[] = [];

    private on_candle: TCandleListener;
    private message_subscription: { unsubscribe: () => void } | null = null;
    private subscription_id: string | null = null;
    private last_update_ms = 0;

    constructor(symbol: string, granularity: number, on_candle: TCandleListener) {
        this.symbol = symbol;
        this.granularity = granularity;
        this.on_candle = on_candle;
    }

    /** True once no update has arrived for a suspiciously long stretch — the store should fall back to NO TRADE. */
    isStale(): boolean {
        if (!this.last_update_ms) return false;
        return Date.now() - this.last_update_ms > this.granularity * 1000 * STALE_MULTIPLIER;
    }

    async start(): Promise<void> {
        if (!api_base.api) throw new Error('Not connected.');

        this.message_subscription = api_base.api.onMessage().subscribe(({ data }: { data: Record<string, unknown> }) => {
            if (data.msg_type !== 'ohlc') return;
            const ohlc = data.ohlc as
                | { symbol?: string; open?: number | string; high?: number | string; low?: number | string; close?: number | string; epoch?: number | string }
                | undefined;
            if (ohlc?.symbol !== this.symbol) return;
            const candle: TCandle = {
                epoch: Number(ohlc.epoch),
                open: Number(ohlc.open),
                high: Number(ohlc.high),
                low: Number(ohlc.low),
                close: Number(ohlc.close),
            };
            if (!Number.isFinite(candle.close)) return;

            this.last_update_ms = Date.now();
            const last = this.candles[this.candles.length - 1];
            if (last && last.epoch === candle.epoch) {
                this.candles = [...this.candles.slice(0, -1), candle];
            } else {
                this.candles = [...this.candles, candle].slice(-MAX_BUFFER);
            }
            this.on_candle(this.candles);
        });

        let response;
        try {
            response = await api_base.api.send({
                ticks_history: this.symbol,
                subscribe: 1,
                end: 'latest',
                count: MAX_BUFFER,
                style: 'candles',
                granularity: this.granularity,
            });
        } catch (err) {
            this.stop();
            throw new Error(describeError(err, 'Could not reach the candle feed.'));
        }

        if (response?.error) {
            this.stop();
            throw new Error(describeError(response, 'Deriv rejected the candle feed request.'));
        }

        const initial_candles = response?.candles;
        if (Array.isArray(initial_candles)) {
            this.candles = initial_candles.map((c: Record<string, unknown>) => ({
                epoch: Number(c.epoch),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
            }));
            this.last_update_ms = Date.now();
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
