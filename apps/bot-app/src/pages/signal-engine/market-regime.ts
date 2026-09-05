import { TIndicatorSnapshot } from './technical-indicators';

/**
 * Rule-based market regime classification — deliberately transparent
 * threshold logic, not presented as a trained model. A real trained regime
 * detector (e.g. a hidden Markov model) would need far more history than a
 * fresh install has, so this is the honest version: a human-auditable set
 * of rules over the same indicators the signal engine already computes.
 */

export type TMarketRegime = 'BULLISH_MOMENTUM' | 'BEARISH_MOMENTUM' | 'VOLATILE_BREAKOUT' | 'RANGING';

export const REGIME_LABELS: Record<TMarketRegime, string> = {
    BULLISH_MOMENTUM: 'Bullish momentum',
    BEARISH_MOMENTUM: 'Bearish momentum',
    VOLATILE_BREAKOUT: 'Volatile breakout',
    RANGING: 'Ranging',
};

export const detectRegime = (snap: TIndicatorSnapshot): TMarketRegime => {
    const bullish_stack = snap.ema5 > snap.ema9 && snap.ema9 > snap.ema20;
    const bearish_stack = snap.ema5 < snap.ema9 && snap.ema9 < snap.ema20;
    const outside_bands = snap.bb_percent_b > 1 || snap.bb_percent_b < 0;
    const band_width_pct = (snap.bb_upper - snap.bb_lower) / snap.bb_middle;
    const atr_pct = snap.atr14 / snap.price;
    // A band-width/ATR ratio well above 1 means the bands have expanded
    // faster than "typical" recent volatility — a breakout, not just noise.
    const expanding = band_width_pct > atr_pct * 3;

    if (outside_bands && expanding) return 'VOLATILE_BREAKOUT';
    if (bullish_stack && snap.momentum10 > 0 && snap.macd_histogram > 0) return 'BULLISH_MOMENTUM';
    if (bearish_stack && snap.momentum10 < 0 && snap.macd_histogram < 0) return 'BEARISH_MOMENTUM';
    return 'RANGING';
};
