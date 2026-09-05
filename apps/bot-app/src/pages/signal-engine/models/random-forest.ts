import { DecisionTreeModel } from './decision-tree';
import { TTrainingSample } from './training-data';

/**
 * A real bagged ensemble of decision trees: each tree trains on a bootstrap
 * resample of the accumulated trade history and a random subset of
 * features, exactly as random forest is meant to work — this is not the
 * same model as decision-tree.ts wearing a different label.
 *
 * Batch-retrained periodically (see signal-engine-store.ts), not
 * incrementally — genuine random forests aren't online learners.
 */

const bootstrapSample = (samples: TTrainingSample[]): TTrainingSample[] => {
    const n = samples.length;
    const result: TTrainingSample[] = [];
    for (let i = 0; i < n; i++) {
        result.push(samples[Math.floor(Math.random() * n)]);
    }
    return result;
};

const randomFeatureSubset = (feature_count: number, k: number): number[] => {
    const indices = Array.from({ length: feature_count }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, k);
};

export class RandomForestModel {
    private trees: DecisionTreeModel[] = [];
    n_trees: number;

    constructor(n_trees = 15) {
        this.n_trees = n_trees;
    }

    get is_trained(): boolean {
        return this.trees.length > 0;
    }

    train(samples: TTrainingSample[], feature_count: number): void {
        if (samples.length < 20) {
            this.trees = [];
            return;
        }
        const features_per_tree = Math.max(2, Math.round(Math.sqrt(feature_count)));
        this.trees = Array.from({ length: this.n_trees }, () => {
            const tree = new DecisionTreeModel(4, 5);
            tree.train(bootstrapSample(samples), randomFeatureSubset(feature_count, features_per_tree));
            return tree;
        });
    }

    predict(features: number[]): number {
        if (!this.trees.length) return 0.5;
        const probabilities = this.trees.map(tree => tree.predict(features));
        return probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
    }
}
