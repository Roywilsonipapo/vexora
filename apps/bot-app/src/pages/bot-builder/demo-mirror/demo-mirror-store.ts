import { action, makeObservable, observable } from 'mobx';
import { getAutoRunnerStore } from '@/pages/auto-runner/auto-runner-store';
import { observer as globalObserver } from '@/external/bot-skeleton';
// eslint-disable-next-line import/no-unresolved -- vendored JS helper, no types
import { tradeOptionToBuy } from '@/external/bot-skeleton/services/tradeEngine/utils/helpers';
import RootStore from '@/stores/root-store';
import { isDemoAccount } from '@/utils/account-helpers';
import { connectReal, disconnectReal, getAccountsSummary, sendReal } from './real-account-connection';

/**
 * Demo→real mirror: when armed, every trade this bot buys on the demo
 * account also fires on the real account, up to a stake cap.
 *
 * A standalone MobX store rather than React state — same reasoning as
 * auto-runner-store.ts: this app's Tabs component unmounts inactive tabs,
 * and the whole point of this feature is that it keeps working even if
 * Bot Builder isn't the visible tab while a bot is running.
 *
 * Hooks into 'bot.purchase_sent', emitted from
 * external/bot-skeleton/services/tradeEngine/trade/Purchase.js right
 * before the real purchase engine sends its own buy — that's the earliest
 * point the full trade parameters are known, so the mirror fires in
 * near-parallel with the demo trade rather than after the fact.
 *
 * Safety rules, all enforced here, none of them optional:
 * - Never armed on load. Every session starts idle; arming is manual.
 * - Requires a stake cap greater than 0. Trades above it are skipped, not
 *   resized — resizing would mean the "real" side isn't actually the same
 *   trade anymore.
 * - Refuses to arm (and force-disarms) if Auto-Runner is active — an
 *   unattended restart loop plus real-money mirroring is the one
 *   combination this deliberately does not allow.
 * - Force-disarms if the active account stops being demo mid-session
 *   (e.g. the user switches accounts) — mirroring from a non-demo session
 *   would double-buy on real.
 * - Only mirrors stake-basis trades. Payout-basis "amount" means something
 *   different and mapping it through the stake cap would misrepresent the
 *   real risk, so those are skipped and logged instead of guessed at.
 */

export type TMirrorStatus = 'idle' | 'connecting' | 'armed' | 'error';
export type TMirrorLogKind = 'armed' | 'disarmed' | 'fired' | 'skipped' | 'failed' | 'auto-disarmed';
export type TMirrorLogEntry = { id: number; time: number; kind: TMirrorLogKind; text: string };

/** sendReal/connectReal can reject with a plain Deriv error response object
 *  (e.g. { error: { message, code } }), not always a JS Error — surfaces
 *  the real message either way instead of falling back to a generic string
 *  that hides what Deriv actually said. */
const describeError = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        const anyErr = err as { error?: { message?: string; code?: string } };
        if (anyErr.error?.message) return anyErr.error.code ? `${anyErr.error.message} (${anyErr.error.code})` : anyErr.error.message;
    }
    return fallback;
};

const AUTO_RUNNER_POLL_MS = 2000;
const LOG_CAP = 100;

class DemoMirrorStore {
    root_store: RootStore;
    status: TMirrorStatus = 'idle';
    stake_cap = 0;
    log: TMirrorLogEntry[] = [];
    demo_account_id: string | null = null;
    real_account_id: string | null = null;

    private log_id = 0;
    private auto_runner_check_interval: ReturnType<typeof setInterval> | null = null;

    constructor(root_store: RootStore) {
        makeObservable(this, {
            status: observable,
            stake_cap: observable,
            log: observable,
            demo_account_id: observable,
            real_account_id: observable,
            arm: action,
            disarm: action,
        });
        this.root_store = root_store;
        this.refreshAccounts();
    }

    get is_armed() {
        return this.status === 'armed';
    }

    get can_arm() {
        return !!this.demo_account_id && !!this.real_account_id;
    }

    refreshAccounts = () => {
        const { demo_account_id, real_account_id } = getAccountsSummary();
        this.demo_account_id = demo_account_id;
        this.real_account_id = real_account_id;
    };

    arm = async (stake_cap: number) => {
        if (this.status === 'armed' || this.status === 'connecting') return;
        this.refreshAccounts();

        if (!this.can_arm) {
            this.pushLog('failed', 'Need both a demo and a real account on this login to mirror.');
            return;
        }
        if (!isDemoAccount(this.root_store.client.loginid ?? '')) {
            this.pushLog('failed', 'Switch to your demo account before arming the mirror.');
            return;
        }
        if (!(stake_cap > 0)) {
            this.pushLog('failed', 'Set a stake cap greater than 0 before arming.');
            return;
        }
        if (getAutoRunnerStore(this.root_store).is_active) {
            this.pushLog('failed', 'Auto-Runner is active — stop it before arming the mirror.');
            return;
        }

        this.status = 'connecting';
        try {
            await connectReal(this.real_account_id as string);
        } catch (err) {
            this.status = 'idle';
            this.pushLog('failed', describeError(err, 'Could not connect to your real account.'));
            return;
        }

        this.stake_cap = stake_cap;
        this.status = 'armed';
        this.pushLog('armed', `Mirror armed — demo trades up to ${stake_cap} will also fire on your real account.`);

        globalObserver.register('bot.purchase_sent', this.handlePurchaseSent);

        // Polled rather than reacted to, to avoid coupling this store's
        // lifecycle to auto-runner-store's — only runs while armed.
        this.auto_runner_check_interval = setInterval(() => {
            if (getAutoRunnerStore(this.root_store).is_active) {
                this.pushLog('auto-disarmed', 'Auto-Runner started — mirror disarmed automatically.');
                this.disarm();
            }
        }, AUTO_RUNNER_POLL_MS);
    };

    disarm = () => {
        if (this.status !== 'armed' && this.status !== 'connecting') return;
        globalObserver.unregister('bot.purchase_sent', this.handlePurchaseSent);
        if (this.auto_runner_check_interval) {
            clearInterval(this.auto_runner_check_interval);
            this.auto_runner_check_interval = null;
        }
        disconnectReal();
        this.status = 'idle';
        this.pushLog('disarmed', 'Mirror disarmed.');
    };

    private handlePurchaseSent = async (data: { contract_type: string; trade_option: Record<string, unknown> }) => {
        if (this.status !== 'armed') return;

        if (!isDemoAccount(this.root_store.client.loginid ?? '')) {
            this.pushLog('auto-disarmed', 'Active account is no longer demo — mirror disarmed automatically.');
            this.disarm();
            return;
        }

        const { contract_type, trade_option } = data ?? {};
        if (!contract_type || !trade_option) return;

        const basis = trade_option.basis;
        const amount = Number(trade_option.amount) || 0;

        if (basis !== 'stake') {
            this.pushLog('skipped', `Skipped a ${contract_type} trade — only stake-basis trades can be mirrored safely.`);
            return;
        }
        if (amount <= 0) {
            this.pushLog('skipped', `Skipped a ${contract_type} trade — could not read its stake.`);
            return;
        }
        if (amount > this.stake_cap) {
            this.pushLog(
                'skipped',
                `Skipped a ${contract_type} trade — stake ${amount} is over your cap of ${this.stake_cap}.`
            );
            return;
        }

        try {
            const buy_request = tradeOptionToBuy(contract_type, trade_option);
            const res = await sendReal<{
                buy?: { contract_id?: number; buy_price?: number };
                error?: { message?: string };
            }>(buy_request);
            if (res?.error) {
                this.pushLog('failed', `Real trade failed: ${res.error.message || 'Deriv rejected it.'}`);
                return;
            }
            this.pushLog('fired', `Mirrored ${contract_type} for ${amount} on your real account.`);
        } catch (err) {
            this.pushLog(
                'failed',
                `Real trade failed: ${describeError(err, 'Could not reach your real account.')}`
            );
        }
    };

    private pushLog = (kind: TMirrorLogKind, text: string) => {
        this.log = [{ id: ++this.log_id, time: Date.now(), kind, text }, ...this.log].slice(0, LOG_CAP);
    };
}

let instance: DemoMirrorStore | null = null;

export const getDemoMirrorStore = (root_store: RootStore): DemoMirrorStore => {
    if (!instance) instance = new DemoMirrorStore(root_store);
    return instance;
};

export default DemoMirrorStore;
