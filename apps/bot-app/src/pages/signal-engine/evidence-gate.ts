import { oneProportionZTest } from './stats-utils';

/**
 * The honesty gate every signal — Forex or Digits — has to pass before it's
 * allowed to claim anything more than "no reliable edge". Compares a
 * model's observed accuracy against the contract's real chance-level
 * baseline with a two-tailed proportion test, so a lucky streak at small
 * sample size can't dress itself up as a discovery.
 */

export type TEvidenceStatus = 'INSUFFICIENT_PREDICTIVE_EVIDENCE' | 'NO_RELIABLE_EDGE' | 'EDGE_DETECTED';

export type TEvidenceResult = {
    status: TEvidenceStatus;
    label: string;
    sample_size: number;
    observed_accuracy: number;
    baseline_accuracy: number;
    z: number;
    p_value: number;
};

const MIN_SAMPLE_SIZE = 30;
const SIGNIFICANCE_LEVEL = 0.05;
// A statistically significant edge that's too small to plausibly survive a
// real payout structure's built-in margin isn't worth calling a discovery.
const MIN_EDGE_MAGNITUDE = 0.03;

export const evaluateEvidence = (hits: number, n: number, baseline_p: number): TEvidenceResult => {
    const test = oneProportionZTest(hits, n, baseline_p);

    let status: TEvidenceStatus;
    let label: string;
    if (n < MIN_SAMPLE_SIZE) {
        status = 'INSUFFICIENT_PREDICTIVE_EVIDENCE';
        label = 'Insufficient predictive evidence';
    } else if (test.p_value < SIGNIFICANCE_LEVEL && test.observed_p - baseline_p > MIN_EDGE_MAGNITUDE) {
        status = 'EDGE_DETECTED';
        label = 'Edge detected';
    } else {
        status = 'NO_RELIABLE_EDGE';
        label = 'No reliable edge detected';
    }

    return {
        status,
        label,
        sample_size: n,
        observed_accuracy: test.observed_p,
        baseline_accuracy: baseline_p,
        z: test.z,
        p_value: test.p_value,
    };
};
