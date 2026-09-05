import { action, makeObservable, observable } from 'mobx';
import { getAutoRunnerStore } from '@/pages/auto-runner/auto-runner-store';
import { TContract } from '@/pages/market-analysis/backtest-engine';
import RootStore from '@/stores/root-store';
import { handOffToAutoRunner } from './auto-runner-bridge';
import { CandleFeed } from './candle-feed';
import { digitBaselineWinProbability, FOREX_BASELINE_WIN_PROBABILITY } from './contract-baselines';
import { NEEDS_BARRIER, TContractType, TSettledContract } from './contract-execution';
import { computeDigitFeatures, DIGITS_FEATURE_COUNT } from './digit-features';
import { DigitFeed } from './digit-feed';
import { DigitStatsEngine, TDigitStats } from './digit-stats';
import { evaluateEvidence, MIN_SAMPLE_SIZE, TEvidenceResult } from './evidence-gate';
import { JournalStore, TJournalEntry, TMarketType } from './journal-store';
import { detectRegime, REGIME_LABELS, TMarketRegime } from './market-regime';
import { ModelEnsemble, TEnsembleResult, TEnsembleSerialized } from './models/ensemble';
import { simulatePaperTrade } from './paper-execution';
import { DEFAULT_RISK_CONFIG, RiskEngine, TRiskConfig } from './risk-engine';
import {
    computeIndicators,
    FEATURE_COUNT as FOREX_FEATURE_COUNT,
    indicatorsToFeatureVector,
    TIndicatorSnapshot,
} from './technical-indicators';
import { TickFeed } from './tick-feed';

/**
 * Binary Scalper orchestration: MARKET DATA -> DATA VALIDATION -> FEATURE
 * ENGINEERING -> STATISTICAL ANALYSIS -> ML ENGINE -> PROBABILITY
 * ESTIMATION -> SIGNAL ENGINE -> RISK ENGINE -> EXECUTION -> OUTCOME ->
 * MODEL EVALUATION, for both Forex Binary and Digits.
 *
 * Two independent pipelines share this store and the same model classes,
 * but never the same model INSTANCE or training history — each
 * market/contract configuration gets its own ModelEnsemble, keyed and
 * persisted separately (see getConfigKey), because a Digits Even/Odd model
 * and a Digits Over-5 model are predicting genuinely different things, and
 * Forex shouldn't influence either.
 *
 * The honesty rule that governs every signal, in both markets: a raw
 * probability crossing the confidence threshold is necessary but not
 * sufficient. evidence-gate.ts's statistical test against the contract's
 * real chance-level baseline can additionally veto trading outright
 * (NO_RELIABLE_EDGE) once there's enough history to say the model isn't
 * beating chance — this is the mechanism that lets Digits genuinely report
 * "no edge" rather than ever being forced to pretend one exists.
 *
 * Singleton store, same reasoning as auto-runner-store.ts and
 * demo-mirror-store.ts — the Tabs component unmounts inactive tab content,
 * and this has to keep running (and learning) regardless of which tab is
 * visible.
 *
 * Execution model: this store never places a "real" trade itself. Below
 * the evidence gate's sample floor, every signal is a paper simulation
 * (real proposal pricing, real observed settlement, zero cost) purely so
 * the ensemble has something to learn from — that's the only way it can
 * ever climb out of calibration. The moment the evidence gate reaches
 * EDGE_DETECTED for a signal, this hands that one decision off to
 * Auto-Runner (auto-runner-bridge.ts) and disarms — from that point on,
 * Auto-Runner's own run/restart/risk machinery is what's actually trading,
 * not this store.
 */

export type TSignalStatus = 'idle' | 'connecting' | 'armed' | 'error';
export type TSignalLogKind = 'armed' | 'disarmed' | 'placed' | 'won' | 'lost' | 'skipped' | 'failed' | 'blocked';
export type TSignalLogEntry = { id: number; time: number; kind: TSignalLogKind; text: string };
export type TConfidenceLabel = 'LOW' | 'MEDIUM' | 'HIGH';
export type TSignalDirection = 'CALL' | 'PUT' | 'CONTRACT' | 'NO_TRADE';

export type TCurrentPrediction = {
    market_type: TMarketType;
    ensemble: TEnsembleResult;
    confidence_label: TConfidenceLabel;
    signal: TSignalDirection;
    evidence: TEvidenceResult;
    regime?: TMarketRegime;
    regime_label?: string;
    explanations: { label: string; value: string }[];
    model_version: number;
};

const LOG_CAP = 100;
const FOREX_GRANULARITY_SECONDS = 60;

const loadEnsembleState = (loginid: string, config_key: string): TEnsembleSerialized | undefined => {
    try {
        const raw = localStorage.getItem(`vx_signal_ensemble_${loginid}_${config_key}`);
        return raw ? (JSON.parse(raw) as TEnsembleSerialized) : undefined;
    } catch {
        return undefined;
    }
};

const saveEnsembleState = (loginid: string, config_key: string, state: TEnsembleSerialized): void => {
    try {
        localStorage.setItem(`vx_signal_ensemble_${loginid}_${config_key}`, JSON.stringify(state));
    } catch {
        // best-effort — learning just won't persist across sessions this time
    }
};

const confidenceLabelFor = (probability: number): TConfidenceLabel => {
    const distance = Math.abs(probability - 0.5);
    if (distance >= 0.15) return 'HIGH';
    if (distance >= 0.05) return 'MEDIUM';
    return 'LOW';
};

type TPendingTrade = {
    market_type: TMarketType;
    config_key: string;
    features: number[];
    ensemble_probability_at_prediction: number;
    contract_type: TContractType;
    symbol: string;
    barrier?: number;
    duration: number;
    duration_unit: string;
    regime_label?: string;
    agreement_label: string;
    confidence_label: TConfidenceLabel;
    model_version: number;
};

class SignalEngineStore {
    root_store: RootStore;
    status: TSignalStatus = 'idle';
    market_type: TMarketType = 'forex';
    stake = 1;
    confidence_threshold = 0.55;
    log: TSignalLogEntry[] = [];

    // Forex config
    forex_symbol = 'frxEURUSD';

    // Digits config
    digits_symbol = 'R_100';
    digits_contract: TContract = 'DIGITEVEN';
    digits_barrier = 5;

    current_price: number | null = null;
    current_digit: number | null = null;
    digit_stats: TDigitStats | null = null;
    current_prediction: TCurrentPrediction | null = null;

    risk_config: TRiskConfig = DEFAULT_RISK_CONFIG;
    risk_engine = new RiskEngine(DEFAULT_RISK_CONFIG);
    journal: JournalStore;

    private ensembles = new Map<string, ModelEnsemble>();
    private forex_candle_feed: CandleFeed | null = null;
    private forex_tick_feed: TickFeed | null = null;
    private digit_feed: DigitFeed | null = null;
    private digit_stats_engine = new DigitStatsEngine();
    private pending: TPendingTrade | null = null;
    private last_candle_count = 0;
    private log_id = 0;

    constructor(root_store: RootStore) {
        makeObservable(this, {
            status: observable,
            market_type: observable,
            stake: observable,
            confidence_threshold: observable,
            log: observable,
            forex_symbol: observable,
            digits_symbol: observable,
            digits_contract: observable,
            digits_barrier: observable,
            current_price: observable,
            current_digit: observable,
            digit_stats: observable,
            current_prediction: observable,
            risk_config: observable,
            arm: action,
            disarm: action,
            setMarketType: action,
            setStake: action,
            setConfidenceThreshold: action,
            setForexSymbol: action,
            setDigitsContract: action,
            setDigitsBarrier: action,
            setRiskConfig: action,
            emergencyStop: action,
        });
        this.root_store = root_store;
        this.journal = new JournalStore(this.loginid);
    }

    get loginid(): string {
        return this.root_store.client?.loginid ?? 'anonymous';
    }

    get is_armed(): boolean {
        return this.status === 'armed';
    }

    get has_pending_trade(): boolean {
        return !!this.pending;
    }

    getEnsembleForCurrentConfig(): ModelEnsemble {
        return this.getEnsemble(this.getConfigKey());
    }

    // --- Config setters (only while idle, matching demo-mirror/auto-runner's
    // "can't reconfigure a running system" convention) ----------------------

    setMarketType = (market_type: TMarketType) => {
        if (this.status === 'idle') this.market_type = market_type;
    };
    setStake = (stake: number) => {
        if (this.status === 'idle') this.stake = stake;
    };
    setConfidenceThreshold = (value: number) => {
        this.confidence_threshold = value;
    };
    setForexSymbol = (symbol: string) => {
        if (this.status === 'idle') this.forex_symbol = symbol;
    };
    setDigitsSymbol = (symbol: string) => {
        if (this.status === 'idle') this.digits_symbol = symbol;
    };
    setDigitsContract = (contract: TContract) => {
        if (this.status === 'idle') this.digits_contract = contract;
    };
    setDigitsBarrier = (barrier: number) => {
        if (this.status === 'idle') this.digits_barrier = barrier;
    };
    setRiskConfig = (config: TRiskConfig) => {
        this.risk_config = config;
        this.risk_engine.config = config;
    };
    emergencyStop = () => {
        this.risk_engine.emergencyStop();
        this.pushLog('blocked', 'Emergency stop engaged — no further trades until cleared.');
    };
    clearEmergencyStop = () => {
        this.risk_engine.clearEmergencyStop();
    };

    // --- Lifecycle -----------------------------------------------------------

    arm = async () => {
        if (this.status === 'armed' || this.status === 'connecting') return;
        if (!(this.stake > 0)) {
            this.pushLog('failed', 'Set a stake greater than 0 before arming.');
            return;
        }
        if (getAutoRunnerStore(this.root_store).is_active) {
            this.pushLog('failed', 'Auto-Runner is active — stop it before arming the Binary Scalper.');
            return;
        }

        this.status = 'connecting';
        try {
            if (this.market_type === 'forex') {
                this.last_candle_count = 0;
                this.forex_candle_feed = new CandleFeed(this.forex_symbol, FOREX_GRANULARITY_SECONDS, this.handleForexCandle);
                this.forex_tick_feed = new TickFeed(this.forex_symbol, this.handleForexTick);
                await Promise.all([this.forex_candle_feed.start(), this.forex_tick_feed.start()]);
            } else {
                this.digit_stats_engine = new DigitStatsEngine();
                this.digit_feed = new DigitFeed(this.digits_symbol, this.handleDigit);
                await this.digit_feed.start();
                this.digit_feed.digits.forEach(d => this.digit_stats_engine.addDigit(d));
                this.digit_stats = this.digit_stats_engine.getStats();
            }
        } catch (err) {
            this.status = 'idle';
            this.forex_candle_feed = null;
            this.forex_tick_feed = null;
            this.digit_feed = null;
            this.pushLog('failed', err instanceof Error ? err.message : 'Could not start the market data feed.');
            return;
        }

        this.risk_engine.clearConsecutiveLosses();
        this.status = 'armed';
        this.pushLog(
            'armed',
            `Armed on ${this.market_type === 'forex' ? this.forex_symbol : this.digits_symbol} — stake ${this.stake}. Calibrating until a validated edge is found.`
        );
    };

    disarm = (reason = 'Disarmed.') => {
        if (this.status !== 'armed' && this.status !== 'connecting') return;
        this.forex_candle_feed?.stop();
        this.forex_candle_feed = null;
        this.forex_tick_feed?.stop();
        this.forex_tick_feed = null;
        this.digit_feed?.stop();
        this.digit_feed = null;
        this.pending = null;
        this.status = 'idle';
        this.current_prediction = null;
        this.pushLog('disarmed', reason);
    };

    // --- Per-config model access ----------------------------------------------

    private getConfigKey(): string {
        if (this.market_type === 'forex') return `forex_${this.forex_symbol}`;
        const barrier_part = NEEDS_BARRIER.includes(this.digits_contract) ? `_${this.digits_barrier}` : '';
        return `digits_${this.digits_symbol}_${this.digits_contract}${barrier_part}`;
    }

    private getEnsemble(config_key: string): ModelEnsemble {
        if (!this.ensembles.has(config_key)) {
            const feature_count = config_key.startsWith('forex_') ? FOREX_FEATURE_COUNT : DIGITS_FEATURE_COUNT;
            const saved = loadEnsembleState(this.loginid, config_key);
            this.ensembles.set(config_key, ModelEnsemble.restore(feature_count, saved));
        }
        return this.ensembles.get(config_key) as ModelEnsemble;
    }

    // --- Forex pipeline --------------------------------------------------------

    private handleForexTick = (price: number) => {
        this.current_price = price;
    };

    private handleForexCandle = (candles: { epoch: number; open: number; high: number; low: number; close: number }[]) => {
        if (this.status !== 'armed') return;
        if (candles.length <= this.last_candle_count) return; // still the forming candle updating
        this.last_candle_count = candles.length;

        if (this.forex_candle_feed?.isStale()) {
            this.pushLog('blocked', 'Candle feed looks stale — skipping this cycle.');
            this.current_prediction = null;
            return;
        }

        const closed_candles = candles.slice(0, -1);
        const indicators = computeIndicators(closed_candles);
        if (!indicators) {
            this.current_prediction = null;
            return;
        }

        const regime = detectRegime(indicators);
        const features = indicatorsToFeatureVector(indicators);
        this.evaluateSignal('forex', features, {
            regime,
            regime_label: REGIME_LABELS[regime],
            explanations: explainForex(indicators, regime),
        });
    };

    // --- Digits pipeline ---------------------------------------------------

    private handleDigit = (digit: number) => {
        if (this.status !== 'armed') return;
        this.current_digit = digit;
        this.digit_stats_engine.addDigit(digit);
        this.digit_stats = this.digit_stats_engine.getStats();

        if (this.digit_feed?.isStale()) {
            this.pushLog('blocked', 'Digit feed looks stale — skipping this cycle.');
            this.current_prediction = null;
            return;
        }

        const features = computeDigitFeatures(this.digit_feed?.digits ?? []);
        if (!features) {
            this.current_prediction = null;
            return;
        }

        this.evaluateSignal('digits', features, { explanations: explainDigits(this.digit_stats) });
    };

    // --- Shared signal evaluation -------------------------------------------

    private evaluateSignal = (
        market_type: TMarketType,
        features: number[],
        extra: { regime?: TMarketRegime; regime_label?: string; explanations: { label: string; value: string }[] }
    ) => {
        const config_key = this.getConfigKey();
        const ensemble = this.getEnsemble(config_key);
        const result = ensemble.predict(features);
        const confidence_label = confidenceLabelFor(result.ensemble_probability);

        const baseline =
            market_type === 'forex'
                ? FOREX_BASELINE_WIN_PROBABILITY
                : digitBaselineWinProbability(this.digits_contract, this.digits_barrier);
        const evidence = evaluateEvidence(ensemble.lifetimeHits, ensemble.sampleSize, baseline);

        // Bootstrap problem: a fresh model has all-zero weights, so it
        // predicts exactly 0.5 for every feature vector until it has real
        // outcomes to learn from — and outcomes only come from trades. A
        // pure confidence-threshold gate would deadlock forever at exactly
        // 0.5. While evidence is still insufficient (below the evidence
        // gate's own sample floor), trade anyway purely to collect
        // (features, outcome) pairs — ties broken randomly rather than
        // always the same direction, so calibration data isn't biased by a
        // fixed tie-break rule. This is explicit exploration, not a lowered
        // confidence bar: the evidence label already tells the user these
        // trades aren't backed by a validated model.
        const is_calibrating = ensemble.sampleSize < MIN_SAMPLE_SIZE;

        let signal: TSignalDirection;
        if (market_type === 'forex') {
            if (is_calibrating) {
                const up = result.ensemble_probability > 0.5 || (result.ensemble_probability === 0.5 && Math.random() < 0.5);
                signal = up ? 'CALL' : 'PUT';
            } else if (result.ensemble_probability >= this.confidence_threshold) {
                signal = 'CALL';
            } else if (result.ensemble_probability <= 1 - this.confidence_threshold) {
                signal = 'PUT';
            } else {
                signal = 'NO_TRADE';
            }
        } else if (is_calibrating) {
            signal = 'CONTRACT';
        } else {
            signal = result.ensemble_probability >= this.confidence_threshold ? 'CONTRACT' : 'NO_TRADE';
        }

        // The data has already shown this model doesn't beat chance —
        // the risk/evidence layer overrides whatever the raw probability says.
        if (evidence.status === 'NO_RELIABLE_EDGE') signal = 'NO_TRADE';

        this.current_prediction = {
            market_type,
            ensemble: result,
            confidence_label,
            signal,
            evidence,
            regime: extra.regime,
            regime_label: extra.regime_label,
            explanations: extra.explanations,
            model_version: ensemble.version,
        };

        if (signal === 'NO_TRADE' || this.pending) return;

        const risk_check = this.risk_engine.checkCanTrade(this.stake);
        if (!risk_check.allowed) {
            this.pushLog('skipped', risk_check.reason ?? 'Risk engine declined this trade.');
            return;
        }

        // A validated edge is the one thing that hands control to
        // Auto-Runner rather than continuing to self-calibrate.
        if (evidence.status === 'EDGE_DETECTED') {
            this.handOff(market_type, signal, result, ensemble.version);
            return;
        }

        this.fireCalibrationTrade(market_type, config_key, signal, features, result, confidence_label, extra.regime_label, ensemble.version);
    };

    // --- Handoff to Auto-Runner ---------------------------------------------

    private handOff = async (
        market_type: TMarketType,
        signal: TSignalDirection,
        ensemble_result: TEnsembleResult,
        model_version: number
    ) => {
        const contract_type: TContractType = market_type === 'forex' ? (signal as 'CALL' | 'PUT') : this.digits_contract;
        const symbol = market_type === 'forex' ? this.forex_symbol : this.digits_symbol;
        const duration_unit = market_type === 'forex' ? 'm' : 't';
        const barrier = market_type === 'digits' && NEEDS_BARRIER.includes(contract_type) ? this.digits_barrier : undefined;

        this.pushLog(
            'placed',
            `Validated edge on ${contractLabel(contract_type, barrier)} (${symbol}, ${Math.round(ensemble_result.ensemble_probability * 100)}% probability, v${model_version}) — handing off to Auto-Runner.`
        );

        try {
            await handOffToAutoRunner(this.root_store, market_type, {
                contract_type,
                symbol,
                duration: 1,
                duration_unit,
                stake: this.stake,
                barrier,
            });
            this.disarm('Handed off to Auto-Runner. Re-arm to look for the next signal once you are done with this run.');
        } catch (err) {
            this.pushLog('failed', err instanceof Error ? err.message : 'Could not hand off to Auto-Runner.');
        }
    };

    // --- Calibration (paper) trades ------------------------------------------

    private fireCalibrationTrade = async (
        market_type: TMarketType,
        config_key: string,
        signal: TSignalDirection,
        features: number[],
        ensemble_result: TEnsembleResult,
        confidence_label: TConfidenceLabel,
        regime_label: string | undefined,
        model_version: number
    ) => {
        const contract_type: TContractType = market_type === 'forex' ? (signal as 'CALL' | 'PUT') : this.digits_contract;
        const symbol = market_type === 'forex' ? this.forex_symbol : this.digits_symbol;
        const duration = 1;
        const duration_unit = market_type === 'forex' ? 'm' : 't';
        const barrier = market_type === 'digits' && NEEDS_BARRIER.includes(contract_type) ? this.digits_barrier : undefined;

        this.pending = {
            market_type,
            config_key,
            features,
            ensemble_probability_at_prediction: ensemble_result.ensemble_probability,
            contract_type,
            symbol,
            barrier,
            duration,
            duration_unit,
            regime_label,
            agreement_label: ensemble_result.agreement_label,
            confidence_label,
            model_version,
        };

        const currency = this.root_store.client?.currency ?? 'USD';

        try {
            const entry_value =
                market_type === 'forex'
                    ? this.forex_tick_feed?.prices[this.forex_tick_feed.prices.length - 1] ?? 0
                    : this.digit_feed?.prices[this.digit_feed.prices.length - 1] ?? 0;

            this.pushLog(
                'placed',
                `${contractLabel(contract_type, barrier)} on ${symbol} (calibrating) — confidence ${Math.round(ensemble_result.ensemble_probability * 100)}%.`
            );

            const settled = await simulatePaperTrade({
                contract_type,
                symbol,
                stake: this.stake,
                duration,
                duration_unit,
                currency,
                barrier,
                entry_value,
                pip_size: this.digit_feed?.pip_size,
                getElapsedTicks: () =>
                    market_type === 'forex' ? this.forex_tick_feed?.total_received ?? 0 : this.digit_feed?.total_received ?? 0,
                getCurrentValue: () =>
                    market_type === 'forex'
                        ? this.forex_tick_feed?.prices[this.forex_tick_feed.prices.length - 1] ?? entry_value
                        : this.digit_feed?.prices[this.digit_feed.prices.length - 1] ?? entry_value,
            });
            this.handleSettlement(settled);
        } catch (err) {
            this.pending = null;
            this.pushLog('failed', err instanceof Error ? err.message : 'Could not run the calibration trade.');
        }
    };

    private handleSettlement = (settled: TSettledContract) => {
        const meta = this.pending;
        if (!meta) return;
        this.pending = null;

        const label: 0 | 1 =
            meta.market_type === 'forex' ? (settled.exit_spot >= settled.entry_spot ? 1 : 0) : settled.won ? 1 : 0;

        const ensemble = this.getEnsemble(meta.config_key);
        ensemble.learn(meta.features, label, meta.ensemble_probability_at_prediction);
        saveEnsembleState(this.loginid, meta.config_key, ensemble.serialize());

        this.risk_engine.recordTrade(settled.profit);

        const entry: Omit<TJournalEntry, 'id'> = {
            time: Date.now(),
            market_type: meta.market_type,
            symbol: meta.symbol,
            contract_type: meta.contract_type,
            barrier: meta.barrier,
            duration: meta.duration,
            duration_unit: meta.duration_unit,
            entry_spot: settled.entry_spot,
            exit_spot: settled.exit_spot,
            ensemble_probability: meta.ensemble_probability_at_prediction,
            confidence_label: meta.confidence_label,
            agreement_label: meta.agreement_label,
            market_regime: meta.regime_label,
            model_version: meta.model_version,
            won: settled.won,
            profit: settled.profit,
            is_paper: true,
        };
        this.journal.add(entry);

        this.pushLog(
            settled.won ? 'won' : 'lost',
            `${settled.won ? 'Won' : 'Lost'} ${settled.profit.toFixed(2)} (calibrating) — ensemble now ${ensemble.sampleSize} samples, ${(ensemble.lifetimeAccuracy * 100).toFixed(1)}% accuracy.`
        );
    };

    private pushLog = (kind: TSignalLogKind, text: string) => {
        this.log = [{ id: ++this.log_id, time: Date.now(), kind, text }, ...this.log].slice(0, LOG_CAP);
    };
}

const contractLabel = (contract_type: TContractType, barrier?: number): string =>
    barrier !== undefined ? `${contract_type} ${barrier}` : contract_type;

const explainForex = (snap: TIndicatorSnapshot, regime: TMarketRegime): { label: string; value: string }[] => [
    { label: 'Price', value: snap.price.toFixed(5) },
    { label: 'EMA 5/9/20', value: `${snap.ema5.toFixed(5)} / ${snap.ema9.toFixed(5)} / ${snap.ema20.toFixed(5)}` },
    { label: 'RSI(14)', value: snap.rsi14.toFixed(1) },
    { label: 'MACD histogram', value: snap.macd_histogram.toFixed(6) },
    { label: 'Bollinger %B', value: snap.bb_percent_b.toFixed(2) },
    { label: 'ATR(14)', value: snap.atr14.toFixed(5) },
    { label: 'Momentum(10)', value: `${(snap.momentum10 * 100).toFixed(2)}%` },
    { label: 'Regime', value: REGIME_LABELS[regime] },
];

const explainDigits = (stats: TDigitStats | null): { label: string; value: string }[] => {
    if (!stats) return [];
    return [
        { label: 'Sample size', value: String(stats.sample_size) },
        { label: 'Entropy ratio', value: stats.entropy_ratio.toFixed(3) },
        { label: 'Chi-square p-value', value: stats.chi_square_p_value.toFixed(3) },
        { label: 'Current streak', value: `${stats.current_streak.kind} x${stats.current_streak.length}` },
        { label: 'Lag-1 autocorrelation', value: stats.lag_autocorrelation[0]?.toFixed(3) ?? '0.000' },
    ];
};

let instance: SignalEngineStore | null = null;

export const getSignalEngineStore = (root_store: RootStore): SignalEngineStore => {
    if (!instance) instance = new SignalEngineStore(root_store);
    return instance;
};

export default SignalEngineStore;
