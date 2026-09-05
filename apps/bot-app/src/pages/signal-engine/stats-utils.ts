/**
 * Shared statistical primitives — standard, textbook approximations, used
 * by digit-stats.ts (raw diagnostics) and evidence-gate.ts (the honesty
 * check that decides whether a model's observed accuracy is a real signal
 * or noise).
 */

// Abramowitz & Stegun 7.1.26 — standard erf approximation, max error ~1.5e-7.
export const erf = (x: number): number => {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
    return sign * y;
};

export const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

/** Wilson–Hilferty approximation of the chi-square CDF, via the normal distribution. */
export const chiSquarePValue = (chi_square: number, df: number): number => {
    if (chi_square <= 0) return 1;
    const z = (Math.pow(chi_square / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
    return Math.max(0, Math.min(1, 1 - normalCdf(z)));
};

export const pearsonAutocorrelation = (series: number[], lag: number): number => {
    const n = series.length - lag;
    if (n < 10) return 0;
    const x = series.slice(0, n);
    const y = series.slice(lag, lag + n);
    const mean_x = x.reduce((a, b) => a + b, 0) / n;
    const mean_y = y.reduce((a, b) => a + b, 0) / n;
    let cov = 0;
    let var_x = 0;
    let var_y = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mean_x;
        const dy = y[i] - mean_y;
        cov += dx * dy;
        var_x += dx * dx;
        var_y += dy * dy;
    }
    const denom = Math.sqrt(var_x * var_y);
    return denom === 0 ? 0 : cov / denom;
};

export type TProportionTest = {
    observed_p: number;
    baseline_p: number;
    n: number;
    z: number;
    p_value: number;
};

/** Two-tailed one-proportion z-test: is observed_p significantly different from baseline_p? */
export const oneProportionZTest = (successes: number, n: number, baseline_p: number): TProportionTest => {
    const observed_p = n ? successes / n : 0;
    if (!n || baseline_p <= 0 || baseline_p >= 1) {
        return { observed_p, baseline_p, n, z: 0, p_value: 1 };
    }
    const se = Math.sqrt((baseline_p * (1 - baseline_p)) / n);
    const z = se === 0 ? 0 : (observed_p - baseline_p) / se;
    const p_value = 2 * (1 - normalCdf(Math.abs(z)));
    return { observed_p, baseline_p, n, z, p_value: Math.max(0, Math.min(1, p_value)) };
};
