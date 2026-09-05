/**
 * Online logistic regression: predicts P(outcome = 1 | features), and
 * updates its own weights after every trade settles using the real
 * outcome. This is the one model that genuinely updates incrementally,
 * sample-by-sample — no offline training step, no synthetic labels, just
 * stochastic gradient descent on live results.
 *
 * Feature count is a constructor parameter, not a fixed import, so the same
 * model class serves both the Forex indicator pipeline and the Digits
 * pipeline, which have different feature vectors.
 */

export type TModelState = {
    weights: number[];
    bias: number;
    learning_rate: number;
    n_updates: number;
    n_correct: number;
};

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export class OnlineLogisticModel {
    weights: number[];
    bias: number;
    learning_rate: number;
    n_updates: number;
    n_correct: number;

    constructor(feature_count: number, state?: TModelState) {
        this.weights = state ? [...state.weights] : new Array(feature_count).fill(0);
        this.bias = state?.bias ?? 0;
        this.learning_rate = state?.learning_rate ?? 0.05;
        this.n_updates = state?.n_updates ?? 0;
        this.n_correct = state?.n_correct ?? 0;
    }

    get is_trained(): boolean {
        return this.n_updates > 0;
    }

    /** Probability the price will be higher when the contract settles. */
    predict(features: number[]): number {
        const z = this.weights.reduce((sum, w, i) => sum + w * features[i], this.bias);
        return clamp(sigmoid(z), 0.001, 0.999);
    }

    /** label: 1 if price actually went up over the trade's duration, 0 if down. */
    update(features: number[], label: 0 | 1): void {
        const predicted = this.predict(features);
        const error = label - predicted;
        for (let i = 0; i < this.weights.length; i++) {
            this.weights[i] += this.learning_rate * error * features[i];
        }
        this.bias += this.learning_rate * error;
        this.n_updates += 1;
        if ((predicted >= 0.5 ? 1 : 0) === label) this.n_correct += 1;
    }

    get accuracy(): number {
        if (!this.n_updates) return 0;
        return this.n_correct / this.n_updates;
    }

    serialize(): TModelState {
        return {
            weights: [...this.weights],
            bias: this.bias,
            learning_rate: this.learning_rate,
            n_updates: this.n_updates,
            n_correct: this.n_correct,
        };
    }
}
