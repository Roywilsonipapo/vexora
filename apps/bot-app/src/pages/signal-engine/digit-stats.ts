/**
 * Real statistical diagnostics over a live digit stream — frequency,
 * streaks, transitions, entropy, and a chi-square uniformity test. This is
 * instrumentation, not a predictor: on a certified-RNG synthetic index, the
 * expected, correct result is "close to uniform, high entropy, chi-square
 * not significant" — and this module has to report that honestly if that's
 * what the data shows, same as it would report a genuine deviation if one
 * existed. See evidence-gate.ts for the "does this rise to a real signal"
 * decision, kept deliberately separate from this raw-diagnostics module.
 */

import { chiSquarePValue, pearsonAutocorrelation } from './stats-utils';

const DIGIT_COUNT = 10;
const MAX_HISTORY = 1000;
const ROLLING_WINDOW = 50;

export type TDigitStats = {
    sample_size: number;
    counts: number[];
    frequencies: number[];
    deviations_pct: number[];
    rolling_frequencies: number[];
    chi_square: number;
    chi_square_p_value: number;
    entropy_bits: number;
    entropy_ratio: number;
    transition_matrix: number[][];
    transition_probabilities: number[][];
    lag_autocorrelation: number[];
    current_streak: { kind: 'even' | 'odd' | 'high' | 'low' | 'none'; length: number };
    longest_even_odd_streak: number;
    longest_high_low_streak: number;
};

export class DigitStatsEngine {
    private history: number[] = [];

    addDigit(digit: number): void {
        this.history = [...this.history, digit].slice(-MAX_HISTORY);
    }

    get sampleSize(): number {
        return this.history.length;
    }

    getStats(): TDigitStats | null {
        const n = this.history.length;
        if (n < 20) return null;

        const counts = new Array(DIGIT_COUNT).fill(0);
        this.history.forEach(d => counts[d]++);
        const frequencies = counts.map(c => c / n);
        const expected = n / DIGIT_COUNT;
        const deviations_pct = frequencies.map(f => (f - 0.1) * 100);

        const rolling_window = this.history.slice(-ROLLING_WINDOW);
        const rolling_counts = new Array(DIGIT_COUNT).fill(0);
        rolling_window.forEach(d => rolling_counts[d]++);
        const rolling_frequencies = rolling_counts.map(c => c / rolling_window.length);

        const chi_square = counts.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
        const chi_square_p_value = chiSquarePValue(chi_square, DIGIT_COUNT - 1);

        const entropy_bits = -frequencies.reduce((sum, f) => (f > 0 ? sum + f * Math.log2(f) : sum), 0);
        const max_entropy = Math.log2(DIGIT_COUNT);
        const entropy_ratio = entropy_bits / max_entropy;

        const transition_matrix: number[][] = Array.from({ length: DIGIT_COUNT }, () => new Array(DIGIT_COUNT).fill(0));
        for (let i = 0; i < n - 1; i++) {
            transition_matrix[this.history[i]][this.history[i + 1]] += 1;
        }
        const transition_probabilities = transition_matrix.map(row => {
            const row_total = row.reduce((a, b) => a + b, 0);
            return row_total ? row.map(v => v / row_total) : row.map(() => 0);
        });

        // Pearson autocorrelation of the raw digit value (0-9) against itself
        // shifted by each lag — a simple, standard independence check. Near
        // zero at every lag is the expected result for a genuinely random
        // stream; it does not by itself prove randomness, but a nonzero
        // value that survives the evidence gate would be a real finding.
        const lag_autocorrelation = [1, 2, 3, 4, 5].map(lag => pearsonAutocorrelation(this.history, lag));

        const { current_streak, longest_even_odd_streak, longest_high_low_streak } = computeStreaks(this.history);

        return {
            sample_size: n,
            counts,
            frequencies,
            deviations_pct,
            rolling_frequencies,
            chi_square,
            chi_square_p_value,
            entropy_bits,
            entropy_ratio,
            transition_matrix,
            transition_probabilities,
            lag_autocorrelation,
            current_streak,
            longest_even_odd_streak,
            longest_high_low_streak,
        };
    }
}

const computeStreaks = (history: number[]) => {
    let current_kind: 'even' | 'odd' | 'high' | 'low' | 'none' = 'none';
    let current_length = 0;
    let longest_even_odd = 0;
    let longest_high_low = 0;
    let running_eo: 'even' | 'odd' | null = null;
    let running_eo_len = 0;
    let running_hl: 'high' | 'low' | null = null;
    let running_hl_len = 0;

    history.forEach(digit => {
        const eo = digit % 2 === 0 ? 'even' : 'odd';
        const hl = digit >= 5 ? 'high' : 'low';

        running_eo_len = eo === running_eo ? running_eo_len + 1 : 1;
        running_eo = eo;
        longest_even_odd = Math.max(longest_even_odd, running_eo_len);

        running_hl_len = hl === running_hl ? running_hl_len + 1 : 1;
        running_hl = hl;
        longest_high_low = Math.max(longest_high_low, running_hl_len);
    });

    // "Current streak" reported as whichever of even/odd or high/low is
    // longer right now, since both are always technically "running".
    if (running_eo_len >= running_hl_len && running_eo) {
        current_kind = running_eo;
        current_length = running_eo_len;
    } else if (running_hl) {
        current_kind = running_hl;
        current_length = running_hl_len;
    }

    return {
        current_streak: { kind: current_kind, length: current_length },
        longest_even_odd_streak: longest_even_odd,
        longest_high_low_streak: longest_high_low,
    };
};
