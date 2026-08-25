import { action, makeObservable, observable, reaction } from 'mobx';
import RootStore from '@/stores/root-store';
import { decideNextAction, TDailyState } from './engine';
import {
    announceCycleLoss,
    announceCycleProfit,
    announceDailyLoss,
    announceDailyTarget,
    announceManualStop,
    announceStart,
    cancelSpeech,
} from './speech';
import { playLossChime, playProfitChime, playStartChime, playStopChime, playTargetChime, primeAudio } from './sounds';

/**
 * Auto-Runner's live state, as a standalone MobX store rather than React
 * state.
 *
 * This app's Tabs component (components/shared_ui/tabs/tabs.tsx) only
 * renders the ACTIVE tab's children — switching to another tab unmounts
 * whatever was showing. A tool whose entire job is to keep pressing Run and
 * Reset unattended cannot live in that component's state, or navigating to
 * Free Bots mid-session would silently kill the loop. Instead this mirrors
 * how run_panel/summary_card/transactions already work: a store held by the
 * single long-lived RootStore instance, driven by a mobx reaction on
 * run_panel.is_running rather than a React effect. The page component below
 * only reads and calls it.
 */

export type TStatus = 'idle' | 'running' | 'stopped_target' | 'stopped_loss' | 'stopped_manual' | 'error';
export type TLogKind = 'start' | 'cycle-profit' | 'cycle-loss' | 'target' | 'loss-limit' | 'error' | 'stop';
export type TLogEntry = { id: number; time: number; kind: TLogKind; text: string };

const RAPID_FAIL_MS = 2500;
const RAPID_FAIL_LIMIT = 3;
const RESTART_DELAY_MS = 900;
const LOG_CAP = 100;

const dayKey = () => new Date().toISOString().slice(0, 10);
const dailyStorageKey = (loginid: string) => `vx_autorunner_daily_${loginid}_${dayKey()}`;
const prefsStorageKey = (loginid: string) => `vx_autorunner_prefs_${loginid || 'default'}`;

class AutoRunnerStore {
    root_store: RootStore;

    is_active = false;
    status: TStatus = 'idle';
    daily_profit_target = 0;
    daily_loss_limit = 0;
    sound_on = true;
    voice_on = true;
    daily_state: TDailyState = { cumulative_profit: 0, cycles_completed: 0 };
    log: TLogEntry[] = [];

    private cycle_start = 0;
    private rapid_fail_count = 0;
    private log_id = 0;
    private prev_is_running = false;
    private prev_loginid = '';

    constructor(root_store: RootStore) {
        makeObservable(this, {
            is_active: observable,
            status: observable,
            daily_profit_target: observable,
            daily_loss_limit: observable,
            sound_on: observable,
            voice_on: observable,
            daily_state: observable,
            log: observable,
            setSoundOn: action,
            setVoiceOn: action,
            setDailyProfitTarget: action,
            setDailyLossLimit: action,
            start: action,
            stop: action,
        });

        this.root_store = root_store;
        this.prev_is_running = root_store.run_panel.is_running;
        this.prev_loginid = root_store.client.loginid;
        this.loadPrefs();
        this.loadDailyState();

        reaction(
            () => root_store.run_panel.is_running,
            is_running => this.handleRunningChange(is_running)
        );

        reaction(
            () => root_store.client.loginid,
            loginid => this.handleAccountChange(loginid)
        );
    }

    setSoundOn = (value: boolean) => {
        this.sound_on = value;
        this.savePrefs();
    };

    setVoiceOn = (value: boolean) => {
        this.voice_on = value;
        this.savePrefs();
        if (!value) cancelSpeech();
    };

    setDailyProfitTarget = (value: number) => {
        this.daily_profit_target = Math.max(0, value || 0);
    };

    setDailyLossLimit = (value: number) => {
        this.daily_loss_limit = Math.max(0, value || 0);
    };

    start = () => {
        if (this.is_active) return;
        this.savePrefs();
        this.rapid_fail_count = 0;
        this.is_active = true;
        this.status = 'running';
        primeAudio();
        if (this.sound_on) playStartChime();
        if (this.voice_on) announceStart();

        this.prev_is_running = this.root_store.run_panel.is_running;
        if (this.root_store.run_panel.is_running) {
            // A bot is already running (started from the normal Run button) —
            // arm the watcher on it rather than pressing Run a second time.
            this.cycle_start = Date.now();
            this.pushLog('start', "Auto-Runner armed on the run already in progress.");
        } else {
            this.pushLog('start', 'Auto-Runner armed. Starting the first run.');
            this.runCycle();
        }
    };

    stop = () => {
        if (!this.is_active) return;
        this.is_active = false;
        this.status = 'idle';
        this.pushLog('stop', 'Auto-Runner stopped.');
        if (this.voice_on) announceManualStop();
        cancelSpeech();

        const { run_panel } = this.root_store;
        if (run_panel.is_running || run_panel.has_open_contract) {
            run_panel.onStopButtonClick();
        }
    };

    private runCycle = async () => {
        if (!this.is_active) return;
        this.cycle_start = Date.now();
        await this.root_store.run_panel.onRunButtonClick();
        if (!this.is_active) return;
        if (!this.root_store.run_panel.is_running) {
            this.pushLog(
                'error',
                "Couldn't start a run — load a strategy in Bot Builder and make sure you're logged in and connected, then start again."
            );
            this.status = 'error';
            this.is_active = false;
        }
    };

    private handleAccountChange = (loginid: string) => {
        const prev = this.prev_loginid;
        this.prev_loginid = loginid;
        if (this.is_active && prev) {
            this.pushLog('stop', 'Account switched — Auto-Runner stopped for safety.');
            this.is_active = false;
            this.status = 'idle';
        }
        this.loadPrefs();
        this.loadDailyState();
    };

    private handleRunningChange = (is_running: boolean) => {
        const was_running = this.prev_is_running;
        this.prev_is_running = is_running;
        if (!this.is_active) return;
        if (was_running && !is_running) this.onCycleEnd();
    };

    private onCycleEnd = () => {
        const { transactions, run_panel, client } = this.root_store;
        const cycle_profit = +(transactions.statistics.total_profit || 0).toFixed(2);
        const duration = Date.now() - this.cycle_start;
        const currency = client.currency || '';

        if (duration < RAPID_FAIL_MS && cycle_profit === 0) {
            this.rapid_fail_count += 1;
        } else {
            this.rapid_fail_count = 0;
        }

        if (this.rapid_fail_count >= RAPID_FAIL_LIMIT) {
            this.pushLog(
                'error',
                "Auto-Runner stopped: runs are ending immediately with no result. Check that a strategy is loaded and you're connected, then start again."
            );
            this.status = 'error';
            this.is_active = false;
            if (this.sound_on) playStopChime();
            return;
        }

        const decision = decideNextAction(
            { cycle_profit },
            { daily_profit_target: this.daily_profit_target, daily_loss_limit: this.daily_loss_limit },
            this.daily_state
        );
        this.daily_state = decision.daily_state;
        this.persistDailyState();

        const sign = (n: number) => (n >= 0 ? '+' : '');

        if (decision.action === 'restart') {
            const is_profit = decision.reason === 'cycle_profit';
            this.pushLog(
                is_profit ? 'cycle-profit' : 'cycle-loss',
                `Cycle ${this.daily_state.cycles_completed}: ${sign(cycle_profit)}${cycle_profit.toFixed(2)} ${currency}. Today: ${sign(this.daily_state.cumulative_profit)}${this.daily_state.cumulative_profit.toFixed(2)} ${currency}.`
            );
            if (this.sound_on) (is_profit ? playProfitChime : playLossChime)();
            if (this.voice_on) {
                if (is_profit) announceCycleProfit(cycle_profit, currency);
                else announceCycleLoss(Math.abs(cycle_profit), currency);
            }
            run_panel.clearStat();
            window.setTimeout(this.runCycle, RESTART_DELAY_MS);
        } else {
            const hit_target = decision.reason === 'daily_profit_target';
            this.pushLog(
                hit_target ? 'target' : 'loss-limit',
                `${hit_target ? 'Daily profit target' : 'Daily loss limit'} reached. Today: ${sign(this.daily_state.cumulative_profit)}${this.daily_state.cumulative_profit.toFixed(2)} ${currency}. Auto-Runner stopped.`
            );
            if (this.sound_on) (hit_target ? playTargetChime : playStopChime)();
            if (this.voice_on) {
                if (hit_target) announceDailyTarget(this.daily_state.cumulative_profit, currency);
                else announceDailyLoss(Math.abs(this.daily_state.cumulative_profit), currency);
            }
            run_panel.clearStat();
            this.status = hit_target ? 'stopped_target' : 'stopped_loss';
            this.is_active = false;
        }
    };

    private pushLog = (kind: TLogKind, text: string) => {
        this.log = [{ id: ++this.log_id, time: Date.now(), kind, text }, ...this.log].slice(0, LOG_CAP);
    };

    private loadDailyState = () => {
        const loginid = this.root_store.client.loginid;
        if (!loginid) {
            this.daily_state = { cumulative_profit: 0, cycles_completed: 0 };
            return;
        }
        try {
            const raw = localStorage.getItem(dailyStorageKey(loginid));
            this.daily_state = raw ? JSON.parse(raw) : { cumulative_profit: 0, cycles_completed: 0 };
        } catch {
            this.daily_state = { cumulative_profit: 0, cycles_completed: 0 };
        }
    };

    private persistDailyState = () => {
        const loginid = this.root_store.client.loginid;
        if (!loginid) return;
        try {
            localStorage.setItem(dailyStorageKey(loginid), JSON.stringify(this.daily_state));
        } catch {
            /* private mode or blocked storage — session keeps working in memory */
        }
    };

    private loadPrefs = () => {
        try {
            const raw = localStorage.getItem(prefsStorageKey(this.root_store.client.loginid));
            if (!raw) return;
            const prefs = JSON.parse(raw);
            if (typeof prefs.daily_profit_target === 'number') this.daily_profit_target = prefs.daily_profit_target;
            if (typeof prefs.daily_loss_limit === 'number') this.daily_loss_limit = prefs.daily_loss_limit;
            if (typeof prefs.sound_on === 'boolean') this.sound_on = prefs.sound_on;
            if (typeof prefs.voice_on === 'boolean') this.voice_on = prefs.voice_on;
        } catch {
            /* ignore malformed/blocked storage — defaults already set */
        }
    };

    private savePrefs = () => {
        try {
            localStorage.setItem(
                prefsStorageKey(this.root_store.client.loginid),
                JSON.stringify({
                    daily_profit_target: this.daily_profit_target,
                    daily_loss_limit: this.daily_loss_limit,
                    sound_on: this.sound_on,
                    voice_on: this.voice_on,
                })
            );
        } catch {
            /* private mode or blocked storage — prefs just won't persist */
        }
    };
}

let instance: AutoRunnerStore | null = null;

/** RootStore itself is only ever constructed once for the app's lifetime
 *  (see hooks/useStore.tsx), so caching against it here gives the Auto-Runner
 *  the same one-instance-per-session lifetime as run_panel or summary_card. */
export const getAutoRunnerStore = (root_store: RootStore): AutoRunnerStore => {
    if (!instance) instance = new AutoRunnerStore(root_store);
    return instance;
};

export default AutoRunnerStore;
