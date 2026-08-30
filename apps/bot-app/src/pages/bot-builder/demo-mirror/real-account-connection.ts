import { getAuthInfo } from '@/external/deriv-core';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';

/**
 * A second, parallel connection to the user's REAL account, used only by
 * the demo-mirror feature (see demo-mirror-store.ts) to fire an equivalent
 * buy whenever a trade happens on the demo account this app is normally
 * connected to.
 *
 * Unlike copy-trading's direct-derivws.ts, this does NOT need Deriv's
 * classic API — buy/proposal are core Trading API calls, the same product
 * this app already trades through for the primary (demo) connection. So
 * this reuses the app's own existing per-account OTP mechanism
 * (DerivWSAccountsService.fetchOTPWebSocketURL), just requesting a fresh URL
 * for the REAL account_id specifically, instead of whichever account is
 * currently active.
 *
 * Explicit connect/disconnect lifecycle (not a lazy singleton) — this
 * connection should only exist while the mirror is armed, and must be
 * fully torn down the moment it's disarmed.
 */

export type TAccountsSummary = {
    demo_account_id: string | null;
    real_account_id: string | null;
};

export const getAccountsSummary = (): TAccountsSummary => {
    const accounts = DerivWSAccountsService.getStoredAccounts() ?? [];
    return {
        demo_account_id: accounts.find(a => a.account_type === 'demo')?.account_id ?? null,
        real_account_id: accounts.find(a => a.account_type === 'real')?.account_id ?? null,
    };
};

type TPending = {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
};

let socket: WebSocket | null = null;
let reqCounter = 0;
const pending = new Map<number, TPending>();

const rejectAllPending = (reason: unknown) => {
    pending.forEach(({ reject }) => reject(reason));
    pending.clear();
};

export const isRealConnectionOpen = () => !!socket && socket.readyState === WebSocket.OPEN;

/** Opens the real-account connection. Throws with a real message on any
 *  failure — the caller (demo-mirror-store) treats a failed connect as
 *  "do not arm", never as "arm anyway".
 *
 *  Does NOT send a WS `authorize` message — checked api-base.ts (this app's
 *  own primary connection) and it never sends one either. The OTP-signed
 *  URL from fetchOTPWebSocketURL authenticates the connection at the
 *  handshake itself; a follow-up `authorize` isn't part of this Trading API
 *  surface (same "doesn't implement this" class of rejection Copy Trading
 *  hit) and was the actual cause of every "Could not connect" error. */
export const connectReal = async (realAccountId: string): Promise<void> => {
    const authInfo = getAuthInfo();
    if (!authInfo?.access_token) throw new Error('Not logged in.');

    const wsUrl = await DerivWSAccountsService.fetchOTPWebSocketURL(authInfo.access_token, realAccountId);

    await new Promise<void>((resolve, reject) => {
        let ws: WebSocket;
        try {
            ws = new WebSocket(wsUrl);
        } catch {
            reject(new Error('Could not open a connection to your real account.'));
            return;
        }
        socket = ws;

        ws.onopen = () => {
            resolve();
        };

        ws.onmessage = event => {
            let data: { req_id?: number; error?: { message?: string; code?: string } } | undefined;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }
            const req_id = data?.req_id;
            if (req_id == null || !pending.has(req_id)) return;
            const entry = pending.get(req_id)!;
            pending.delete(req_id);
            if (data?.error) entry.reject(data);
            else entry.resolve(data);
        };

        ws.onerror = () => {
            reject(new Error('Could not reach your real account.'));
        };

        ws.onclose = () => {
            if (socket === ws) socket = null;
            rejectAllPending(new Error('Connection to your real account closed.'));
        };
    });
};

export const disconnectReal = () => {
    rejectAllPending(new Error('Mirror disarmed.'));
    if (socket) {
        try {
            socket.close();
        } catch {
            /* already closing/closed */
        }
        socket = null;
    }
};

export const sendReal = async <T = unknown>(request: Record<string, unknown>): Promise<T> => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Not connected to your real account.');
    }

    const req_id = ++reqCounter;
    return new Promise<T>((resolve, reject) => {
        pending.set(req_id, { resolve: resolve as (value: unknown) => void, reject });
        socket!.send(JSON.stringify({ ...request, req_id }));
    });
};
