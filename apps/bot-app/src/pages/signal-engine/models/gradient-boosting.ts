import { TTrainingSample } from './training-data';

/**
 * A real (simplified) gradient-boosting classifier: additive shallow
 * regression trees fit to the log-loss pseudo-residuals at each stage,
 * exactly the standard algorithm — just with modest depth/estimator counts
 * to stay fast enough to retrain in a browser tab.
 *
 * Has its own small regression-tree implementation (MSE-split) rather than
 * sharing decision-tree.ts's Gini-split classifier — they optimize
 * different objectives, so forcing one abstraction over both would blur
 * what each is actually doing.
 */

type TRegNode =
    | { type: 'leaf'; value: number }
    | { type: 'split'; feature_index: number; threshold: number; left: TRegNode; right: TRegNode };

const mse = (values: number[]): number => {
    if (!values.length) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
};

const bestRegSplit = (
    features: number[][],
    residuals: number[],
    feature_count: number
): { feature_index: number; threshold: number } | null => {
    let best: { feature_index: number; threshold: number; gain: number } | null = null;
    const parent_mse = mse(residuals);

    for (let f = 0; f < feature_count; f++) {
        const values = Array.from(new Set(features.map(row => row[f]))).sort((a, b) => a - b);
        for (let i = 0; i < values.length - 1; i++) {
            const threshold = (values[i] + values[i + 1]) / 2;
            const left_idx: number[] = [];
            const right_idx: number[] = [];
            features.forEach((row, idx) => (row[f] <= threshold ? left_idx : right_idx).push(idx));
            if (!left_idx.length || !right_idx.length) continue;
            const weighted =
                (left_idx.length / residuals.length) * mse(left_idx.map(i => residuals[i])) +
                (right_idx.length / residuals.length) * mse(right_idx.map(i => residuals[i]));
            const gain = parent_mse - weighted;
            if (!best || gain > best.gain) best = { feature_index: f, threshold, gain };
        }
    }

    return best && best.gain > 0 ? { feature_index: best.feature_index, threshold: best.threshold } : null;
};

const buildRegTree = (
    features: number[][],
    residuals: number[],
    feature_count: number,
    depth: number,
    max_depth: number,
    min_samples: number
): TRegNode => {
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    if (depth >= max_depth || residuals.length < min_samples * 2) return { type: 'leaf', value: mean };

    const split = bestRegSplit(features, residuals, feature_count);
    if (!split) return { type: 'leaf', value: mean };

    const left_idx: number[] = [];
    const right_idx: number[] = [];
    features.forEach((row, idx) => (row[split.feature_index] <= split.threshold ? left_idx : right_idx).push(idx));
    if (left_idx.length < min_samples || right_idx.length < min_samples) return { type: 'leaf', value: mean };

    return {
        type: 'split',
        feature_index: split.feature_index,
        threshold: split.threshold,
        left: buildRegTree(
            left_idx.map(i => features[i]),
            left_idx.map(i => residuals[i]),
            feature_count,
            depth + 1,
            max_depth,
            min_samples
        ),
        right: buildRegTree(
            right_idx.map(i => features[i]),
            right_idx.map(i => residuals[i]),
            feature_count,
            depth + 1,
            max_depth,
            min_samples
        ),
    };
};

const predictRegTree = (node: TRegNode, features: number[]): number => {
    if (node.type === 'leaf') return node.value;
    return features[node.feature_index] <= node.threshold
        ? predictRegTree(node.left, features)
        : predictRegTree(node.right, features);
};

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));
const logit = (p: number): number => Math.log(p / (1 - p));

export class GradientBoostingModel {
    private trees: TRegNode[] = [];
    private base_log_odds = 0;
    n_estimators: number;
    learning_rate: number;
    max_depth: number;

    constructor(n_estimators = 20, learning_rate = 0.15, max_depth = 3) {
        this.n_estimators = n_estimators;
        this.learning_rate = learning_rate;
        this.max_depth = max_depth;
    }

    get is_trained(): boolean {
        return this.trees.length > 0;
    }

    train(samples: TTrainingSample[], feature_count: number): void {
        if (samples.length < 20) {
            this.trees = [];
            return;
        }
        const features = samples.map(s => s.features);
        const labels = samples.map(s => s.label);
        const base_rate = Math.min(0.99, Math.max(0.01, labels.reduce((a: number, b) => a + b, 0) / labels.length));
        this.base_log_odds = logit(base_rate);

        let predictions = new Array(samples.length).fill(this.base_log_odds);
        const trees: TRegNode[] = [];

        for (let m = 0; m < this.n_estimators; m++) {
            const residuals = labels.map((y, i) => y - sigmoid(predictions[i]));
            const tree = buildRegTree(features, residuals, feature_count, 0, this.max_depth, 5);
            trees.push(tree);
            predictions = predictions.map((p, i) => p + this.learning_rate * predictRegTree(tree, features[i]));
        }

        this.trees = trees;
    }

    predict(features: number[]): number {
        if (!this.trees.length) return 0.5;
        let log_odds = this.base_log_odds;
        this.trees.forEach(tree => {
            log_odds += this.learning_rate * predictRegTree(tree, features);
        });
        return sigmoid(log_odds);
    }
}
