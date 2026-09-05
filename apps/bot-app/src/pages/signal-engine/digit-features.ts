import { pearsonAutocorrelation } from './stats-utils';

/**
 * Feature vector for the Digits ML pipeline — built once from raw digit
 * history, shared across every Digits contract's model (the label, not the
 * features, is what's contract-specific: see contract-baselines.ts and
 * signal-engine-store.ts for how a given contract's win/loss is derived
 * from the same underlying digit).
 */

export const DIGITS_FEATURE_COUNT = 10;
export const MIN_DIGITS_REQUIRED = 30;

export const computeDigitFeatures = (history: number[]): number[] | null => {
    if (history.length < MIN_DIGITS_REQUIRED) return null;

    const last5 = history.slice(-5);
    while (last5.length < 5) last5.unshift(last5[0] ?? 0);
    const norm_last5 = last5.map(d => d / 9);

    const window20 = history.slice(-20);
    const high_freq = window20.filter(d => d >= 5).length / window20.length;
    const even_freq = window20.filter(d => d % 2 === 0).length / window20.length;

    const window30 = history.slice(-30);
    const counts = new Array(10).fill(0);
    window30.forEach(d => counts[d]++);
    const freqs = counts.map(c => c / window30.length);
    const entropy = -freqs.reduce((sum, f) => (f > 0 ? sum + f * Math.log2(f) : sum), 0);
    const entropy_ratio = entropy / Math.log2(10);

    let streak = 1;
    for (let i = history.length - 1; i > 0; i--) {
        if (history[i] % 2 === history[i - 1] % 2) streak++;
        else break;
    }
    const streak_norm = Math.min(streak, 10) / 10;

    const lag1_autocorrelation = pearsonAutocorrelation(history, 1);

    return [...norm_last5, high_freq - 0.5, even_freq - 0.5, streak_norm, entropy_ratio - 1, lag1_autocorrelation];
};
