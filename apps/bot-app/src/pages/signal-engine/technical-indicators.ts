/**
 * Real technical-indicator math over OHLC candles. Every function here is a
 * standard, textbook formula (EMA/RSI/MACD/Bollinger/ATR) — nothing here
 * invents a number; each one is a straightforward transform of the actual
 * candle series passed in.
 *
 * Deliberately for real market candles (forex/stock indices), not Deriv's
 * synthetic-index digit streams — see signal-engine-store.ts for why.
 */

export type TCandle = { epoch: number; open: number; high: number; low: number; close: number };

export type TIndicatorSnapshot = {
    price: number;
    ema5: number;
    ema9: number;
    ema20: number;
    rsi14: number;
    macd_line: number;
    macd_signal: number;
    macd_histogram: number;
    bb_upper: number;
    bb_middle: number;
    bb_lower: number;
    bb_percent_b: number;
    atr14: number;
    momentum10: number;
    volatility14: number;
};

// EMA20 needs 20 candles of runway, MACD needs slow(26)+signal(9), so 40 is
// the real floor for every indicator here to be meaningful rather than
// distorted by a too-short warm-up window.
export const MIN_CANDLES_REQUIRED = 40;
export const FEATURE_COUNT = 8;

const emaSeries = (values: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
        result.push(values[i] * k + result[i - 1] * (1 - k));
    }
    return result;
};

export const ema = (values: number[], period: number): number => {
    const series = emaSeries(values, period);
    return series[series.length - 1];
};

export const rsi = (closes: number[], period = 14): number => {
    if (closes.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    const avg_gain = gains / period;
    const avg_loss = losses / period;
    if (avg_loss === 0) return 100;
    const rs = avg_gain / avg_loss;
    return 100 - 100 / (1 + rs);
};

export const macd = (
    closes: number[],
    fast = 12,
    slow = 26,
    signal_period = 9
): { macd_line: number; signal_line: number; histogram: number } | null => {
    if (closes.length < slow + signal_period) return null;
    const fast_series = emaSeries(closes, fast);
    const slow_series = emaSeries(closes, slow);
    const macd_line_series = fast_series.map((v, i) => v - slow_series[i]);
    const signal_series = emaSeries(macd_line_series, signal_period);
    const macd_line = macd_line_series[macd_line_series.length - 1];
    const signal_line = signal_series[signal_series.length - 1];
    return { macd_line, signal_line, histogram: macd_line - signal_line };
};

export const bollingerBands = (
    closes: number[],
    period = 20,
    mult = 2
): { upper: number; middle: number; lower: number; percent_b: number } | null => {
    if (closes.length < period) return null;
    const window = closes.slice(-period);
    const middle = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const upper = middle + mult * sd;
    const lower = middle - mult * sd;
    const last = closes[closes.length - 1];
    const percent_b = upper === lower ? 0.5 : (last - lower) / (upper - lower);
    return { upper, middle, lower, percent_b };
};

export const atr = (candles: TCandle[], period = 14): number | null => {
    if (candles.length < period + 1) return null;
    const true_ranges: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const { high, low } = candles[i];
        const prev_close = candles[i - 1].close;
        true_ranges.push(Math.max(high - low, Math.abs(high - prev_close), Math.abs(low - prev_close)));
    }
    const window = true_ranges.slice(-period);
    return window.reduce((a, b) => a + b, 0) / period;
};

export const momentum = (closes: number[], period = 10): number | null => {
    if (closes.length < period + 1) return null;
    const past = closes[closes.length - 1 - period];
    const current = closes[closes.length - 1];
    return (current - past) / past;
};

const computeReturns = (closes: number[]): number[] => {
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    return returns;
};

export const volatility = (closes: number[], period = 14): number => {
    const returns = computeReturns(closes).slice(-period);
    if (!returns.length) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
};

/** Full indicator snapshot for the UI, or null while there isn't enough candle history yet. */
export const computeIndicators = (candles: TCandle[]): TIndicatorSnapshot | null => {
    if (candles.length < MIN_CANDLES_REQUIRED) return null;
    const closes = candles.map(c => c.close);
    const macd_result = macd(closes);
    const bb = bollingerBands(closes, 20, 2);
    const atr_value = atr(candles, 14);
    const mom = momentum(closes, 10);
    if (!macd_result || !bb || atr_value === null || mom === null) return null;

    return {
        price: closes[closes.length - 1],
        ema5: ema(closes.slice(-10), 5),
        ema9: ema(closes.slice(-18), 9),
        ema20: ema(closes.slice(-40), 20),
        rsi14: rsi(closes, 14),
        macd_line: macd_result.macd_line,
        macd_signal: macd_result.signal_line,
        macd_histogram: macd_result.histogram,
        bb_upper: bb.upper,
        bb_middle: bb.middle,
        bb_lower: bb.lower,
        bb_percent_b: bb.percent_b,
        atr14: atr_value,
        momentum10: mom,
        volatility14: volatility(closes, 14),
    };
};

/**
 * Turns a snapshot into the fixed-length numeric vector the ML models
 * consume. Everything is normalized to roughly comparable scales (percent
 * or std-dev terms) so no single raw-price-scale feature dominates the
 * others during training.
 */
export const indicatorsToFeatureVector = (snap: TIndicatorSnapshot): number[] => {
    const ema_fast_slow_diff = (snap.ema5 - snap.ema20) / snap.ema20;
    const ema_mid_diff = (snap.ema9 - snap.ema20) / snap.ema20;
    const rsi_centered = (snap.rsi14 - 50) / 50;
    const macd_hist_norm = snap.macd_histogram / snap.price;
    const bb_percent_b_centered = (snap.bb_percent_b - 0.5) * 2;
    const atr_norm = snap.atr14 / snap.price;

    return [
        ema_fast_slow_diff * 100,
        ema_mid_diff * 100,
        rsi_centered,
        macd_hist_norm * 1000,
        bb_percent_b_centered,
        atr_norm * 1000,
        snap.momentum10 * 100,
        snap.volatility14 * 1000,
    ];
};
