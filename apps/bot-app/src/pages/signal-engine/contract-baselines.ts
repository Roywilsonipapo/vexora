import type { TContract } from '@/pages/market-analysis/backtest-engine';

/**
 * Theoretical chance-level win probability for a Digits contract — the
 * number a model has to beat before "it predicted correctly sometimes"
 * means anything. Reuses the TContract type from the existing market
 * analysis module rather than redefining it.
 */
export const digitBaselineWinProbability = (contract: TContract, barrier: number): number => {
    switch (contract) {
        case 'DIGITOVER':
            return Math.max(0, Math.min(9, 9 - barrier)) / 10;
        case 'DIGITUNDER':
            return Math.max(0, Math.min(9, barrier)) / 10;
        case 'DIGITMATCH':
            return 1 / 10;
        case 'DIGITDIFF':
            return 9 / 10;
        case 'DIGITEVEN':
        case 'DIGITODD':
            return 5 / 10;
        default:
            return 0.5;
    }
};

/** Rise/Fall has no combinatorial baseline like Digits — 0.5 is the standard
 *  "no directional edge" null hypothesis for a short-horizon price move. */
export const FOREX_BASELINE_WIN_PROBABILITY = 0.5;
