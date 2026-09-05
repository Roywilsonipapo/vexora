import { TTrainingSample } from './training-data';

/**
 * A real CART-style binary classification tree: recursive binary splits
 * chosen by Gini-impurity reduction, leaves hold the observed positive
 * rate. Small and simple by design (used as the base learner for the
 * random forest below), but a genuine trained model — not a stand-in.
 */

type TTreeNode =
    | { type: 'leaf'; probability: number }
    | { type: 'split'; feature_index: number; threshold: number; left: TTreeNode; right: TTreeNode };

const gini = (labels: number[]): number => {
    if (!labels.length) return 0;
    const p1 = labels.reduce((a: number, b) => a + b, 0) / labels.length;
    const p0 = 1 - p1;
    return 1 - p0 * p0 - p1 * p1;
};

const bestSplit = (
    samples: TTrainingSample[],
    feature_indices: number[]
): { feature_index: number; threshold: number } | null => {
    let best: { feature_index: number; threshold: number; gain: number } | null = null;
    const parent_gini = gini(samples.map(s => s.label));

    feature_indices.forEach(feature_index => {
        const values = Array.from(new Set(samples.map(s => s.features[feature_index]))).sort((a, b) => a - b);
        for (let i = 0; i < values.length - 1; i++) {
            const threshold = (values[i] + values[i + 1]) / 2;
            const left = samples.filter(s => s.features[feature_index] <= threshold);
            const right = samples.filter(s => s.features[feature_index] > threshold);
            if (!left.length || !right.length) continue;
            const weighted_gini =
                (left.length / samples.length) * gini(left.map(s => s.label)) +
                (right.length / samples.length) * gini(right.map(s => s.label));
            const gain = parent_gini - weighted_gini;
            if (!best || gain > best.gain) best = { feature_index, threshold, gain };
        }
    });

    return best && best.gain > 0 ? { feature_index: best.feature_index, threshold: best.threshold } : null;
};

const buildTree = (
    samples: TTrainingSample[],
    feature_indices: number[],
    depth: number,
    max_depth: number,
    min_samples: number
): TTreeNode => {
    const labels = samples.map(s => s.label);
    const positive_rate = labels.reduce((a: number, b) => a + b, 0) / labels.length;

    if (depth >= max_depth || samples.length < min_samples * 2 || gini(labels) === 0) {
        return { type: 'leaf', probability: positive_rate };
    }

    const split = bestSplit(samples, feature_indices);
    if (!split) return { type: 'leaf', probability: positive_rate };

    const left_samples = samples.filter(s => s.features[split.feature_index] <= split.threshold);
    const right_samples = samples.filter(s => s.features[split.feature_index] > split.threshold);
    if (left_samples.length < min_samples || right_samples.length < min_samples) {
        return { type: 'leaf', probability: positive_rate };
    }

    return {
        type: 'split',
        feature_index: split.feature_index,
        threshold: split.threshold,
        left: buildTree(left_samples, feature_indices, depth + 1, max_depth, min_samples),
        right: buildTree(right_samples, feature_indices, depth + 1, max_depth, min_samples),
    };
};

const predictTree = (node: TTreeNode, features: number[]): number => {
    if (node.type === 'leaf') return node.probability;
    return features[node.feature_index] <= node.threshold ? predictTree(node.left, features) : predictTree(node.right, features);
};

export class DecisionTreeModel {
    private root: TTreeNode | null = null;
    max_depth: number;
    min_samples: number;

    constructor(max_depth = 4, min_samples = 5) {
        this.max_depth = max_depth;
        this.min_samples = min_samples;
    }

    get is_trained(): boolean {
        return this.root !== null;
    }

    train(samples: TTrainingSample[], feature_indices: number[]): void {
        if (samples.length < this.min_samples * 2) {
            this.root = null;
            return;
        }
        this.root = buildTree(samples, feature_indices, 0, this.max_depth, this.min_samples);
    }

    predict(features: number[]): number {
        if (!this.root) return 0.5;
        return predictTree(this.root, features);
    }
}
