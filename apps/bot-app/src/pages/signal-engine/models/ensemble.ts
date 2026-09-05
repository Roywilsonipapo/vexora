import { DecisionTreeModel } from './decision-tree';
import { GradientBoostingModel } from './gradient-boosting';
import { OnlineLogisticModel, TModelState } from './online-logistic';
import { RandomForestModel } from './random-forest';
import { TTrainingSample } from './training-data';

/**
 * Combines the 4 models (logistic regression updates every trade; the tree,
 * forest, and boosting models batch-retrain every RETRAIN_EVERY_N_SAMPLES
 * trades on the accumulated history) into one ensemble probability, tracks
 * how many of them agree, and keeps enough history to detect drift and roll
 * back a retrain that made things worse.
 */

const RETRAIN_EVERY_N_SAMPLES = 15;
const MIN_TRAINING_SAMPLES = 20;
const MAX_TRAINING_HISTORY = 1000;
const ROLLING_WINDOW = 50;
const DRIFT_THRESHOLD = 0.1;

export type TModelPrediction = { name: string; is_trained: boolean; probability: number };

export type TEnsembleResult = {
    ensemble_probability: number;
    predictions: TModelPrediction[];
    agreement_count: number;
    agreement_total: number;
    agreement_label: string;
};

export type TEnsembleSerialized = {
    logistic: TModelState;
    training_data: TTrainingSample[];
    version: number;
    trained_at: number;
    lifetime_hits: number;
    lifetime_total: number;
    rolling_hits: number[];
};

type TPreviousVersion = {
    tree: DecisionTreeModel;
    forest: RandomForestModel;
    boosting: GradientBoostingModel;
    version: number;
};

export class ModelEnsemble {
    version = 1;
    trained_at = 0;

    private feature_count: number;
    private logistic: OnlineLogisticModel;
    private tree = new DecisionTreeModel();
    private forest = new RandomForestModel();
    private boosting = new GradientBoostingModel();
    private training_data: TTrainingSample[] = [];
    private samples_since_retrain = 0;
    private previous_version: TPreviousVersion | null = null;
    private rolling_hits: number[] = [];
    private lifetime_hits = 0;
    private lifetime_total = 0;

    constructor(feature_count: number, logistic_state?: TModelState) {
        this.feature_count = feature_count;
        this.logistic = new OnlineLogisticModel(feature_count, logistic_state);
    }

    get is_ready(): boolean {
        return this.logistic.is_trained;
    }

    get lifetimeAccuracy(): number {
        return this.lifetime_total ? this.lifetime_hits / this.lifetime_total : 0;
    }

    get rollingAccuracy(): number {
        return this.rolling_hits.length ? this.rolling_hits.reduce((a, b) => a + b, 0) / this.rolling_hits.length : 0;
    }

    get sampleSize(): number {
        return this.lifetime_total;
    }

    get lifetimeHits(): number {
        return this.lifetime_hits;
    }

    get driftDetected(): boolean {
        if (this.rolling_hits.length < 20 || this.lifetime_total < 30) return false;
        return this.lifetimeAccuracy - this.rollingAccuracy > DRIFT_THRESHOLD;
    }

    get canRollback(): boolean {
        return this.previous_version !== null;
    }

    predict(features: number[]): TEnsembleResult {
        const sub_models: TModelPrediction[] = [
            { name: 'Logistic regression', is_trained: this.logistic.is_trained, probability: this.logistic.predict(features) },
            { name: 'Decision tree', is_trained: this.tree.is_trained, probability: this.tree.is_trained ? this.tree.predict(features) : 0.5 },
            { name: 'Random forest', is_trained: this.forest.is_trained, probability: this.forest.is_trained ? this.forest.predict(features) : 0.5 },
            {
                name: 'Gradient boosting',
                is_trained: this.boosting.is_trained,
                probability: this.boosting.is_trained ? this.boosting.predict(features) : 0.5,
            },
        ];

        const trained = sub_models.filter(m => m.is_trained);
        const usable = trained.length ? trained : sub_models;
        const ensemble_probability = usable.reduce((sum, m) => sum + m.probability, 0) / usable.length;
        const ensemble_up = ensemble_probability >= 0.5;
        const agreement_count = usable.filter(m => (m.probability >= 0.5) === ensemble_up).length;

        return {
            ensemble_probability,
            predictions: sub_models,
            agreement_count,
            agreement_total: usable.length,
            agreement_label: `${agreement_count}/${usable.length}`,
        };
    }

    /** Called once a trade settles: updates the online model immediately, and
     *  queues the sample for the next batch retrain of the tree/forest/boosting models. */
    learn(features: number[], label: 0 | 1, ensemble_probability_at_prediction: number): void {
        this.logistic.update(features, label);

        this.training_data = [...this.training_data, { features, label }].slice(-MAX_TRAINING_HISTORY);
        this.samples_since_retrain += 1;

        const was_correct = (ensemble_probability_at_prediction >= 0.5 ? 1 : 0) === label ? 1 : 0;
        this.rolling_hits = [...this.rolling_hits, was_correct].slice(-ROLLING_WINDOW);
        this.lifetime_hits += was_correct;
        this.lifetime_total += 1;

        if (this.samples_since_retrain >= RETRAIN_EVERY_N_SAMPLES && this.training_data.length >= MIN_TRAINING_SAMPLES) {
            this.retrain();
            this.samples_since_retrain = 0;
        }
    }

    /** Reverts the tree/forest/boosting models to their pre-previous-retrain
     *  state — a one-step-back rollback, not a full version history. */
    rollback(): boolean {
        if (!this.previous_version) return false;
        this.tree = this.previous_version.tree;
        this.forest = this.previous_version.forest;
        this.boosting = this.previous_version.boosting;
        this.version = this.previous_version.version;
        this.previous_version = null;
        return true;
    }

    serialize(): TEnsembleSerialized {
        return {
            logistic: this.logistic.serialize(),
            training_data: this.training_data,
            version: this.version,
            trained_at: this.trained_at,
            lifetime_hits: this.lifetime_hits,
            lifetime_total: this.lifetime_total,
            rolling_hits: this.rolling_hits,
        };
    }

    static restore(feature_count: number, state?: TEnsembleSerialized): ModelEnsemble {
        const ensemble = new ModelEnsemble(feature_count, state?.logistic);
        if (state) {
            ensemble.training_data = state.training_data ?? [];
            ensemble.version = state.version ?? 1;
            ensemble.trained_at = state.trained_at ?? 0;
            ensemble.lifetime_hits = state.lifetime_hits ?? 0;
            ensemble.lifetime_total = state.lifetime_total ?? 0;
            ensemble.rolling_hits = state.rolling_hits ?? [];
            if (ensemble.training_data.length >= MIN_TRAINING_SAMPLES) {
                ensemble.retrain();
            }
        }
        return ensemble;
    }

    private retrain(): void {
        this.previous_version = { tree: this.tree, forest: this.forest, boosting: this.boosting, version: this.version };

        const feature_indices = Array.from({ length: this.feature_count }, (_, i) => i);
        const new_tree = new DecisionTreeModel();
        new_tree.train(this.training_data, feature_indices);
        const new_forest = new RandomForestModel();
        new_forest.train(this.training_data, this.feature_count);
        const new_boosting = new GradientBoostingModel();
        new_boosting.train(this.training_data, this.feature_count);

        this.tree = new_tree;
        this.forest = new_forest;
        this.boosting = new_boosting;
        this.version += 1;
        this.trained_at = Date.now();
    }
}
