import { getAuthInfo } from '@/external/deriv-core';

/**
 * A second, direct connection to Deriv's classic WebSocket API — separate
 * from api_base, which connects to Deriv's newer, restricted "Trading API"
 * product (api.derivws.com/trading/v1, OTP-authenticated). That product is
 * built for embedding trade execution into partner apps and doesn't
 * implement account-management-class calls at all: get_settings, api_token,
 * copy_start, copy_stop, and copytrading_list all came back
 * "Unrecognised request" over it — not a permission error, a "this server
 * doesn't have this method" error. Those calls only exist on Deriv's classic
 * API (developers.deriv.com, wss://ws.derivws.com).
 *
 * Reuses the app's own OAuth access_token (the same one already obtained on
 * login) rather than asking the user for a separate personal token — the
 * "Vexora Bot" app registration (33VDAoCSdIUstrz1BoGkS, the app_id this app
 * already uses) has Trade, Account management, Payments, and Application
 * insights scope, confirmed via Deriv's own app dashboard, so the existing
 * token should already carry enough scope once it reaches the right
 * endpoint. This is the first live test of that assumption.
 */

const APP_ID = '33VDAoCSdIUstrz1BoGkS';
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

type TPending = {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
};

let socket: WebSocket | null = null;
let readyPromise: Promise<void> | null = null;
let reqCounter = 0;
const pending = new Map<number, TPending>();

const rejectAllPending = (reason: unknown) => {
    pending.forEach(({ reject }) => reject(reason));
    pending.clear();
};

const ensureConnected = (): Promise<void> => {
    if (socket && socket.readyState === WebSocket.OPEN && readyPromise) return readyPromise;

    const authInfo = getAuthInfo();
    if (!authInfo?.access_token) {
        return Promise.reject(new Error('Not logged in.'));
    }

    readyPromise = new Promise<void>((resolve, reject) => {
        let ws: WebSocket;
        try {
            ws = new WebSocket(WS_URL);
        } catch {
            reject(new Error("Could not open a connection to Deriv's classic API."));
            return;
        }
        socket = ws;

        ws.onopen = () => {
            const req_id = ++reqCounter;
            pending.set(req_id, {
                resolve: () => resolve(),
                reject: err => reject(err),
            });
            ws.send(JSON.stringify({ authorize: authInfo.access_token, req_id }));
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
            reject(new Error("Could not reach Deriv's classic API."));
        };

        ws.onclose = () => {
            if (socket === ws) {
                socket = null;
                readyPromise = null;
            }
            rejectAllPending(new Error('Connection to Deriv closed.'));
        };
    });

    return readyPromise;
};

export const sendDirect = async <T = unknown>(request: Record<string, unknown>): Promise<T> => {
    await ensureConnected();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error("Not connected to Deriv's classic API.");
    }

    const req_id = ++reqCounter;
    return new Promise<T>((resolve, reject) => {
        pending.set(req_id, { resolve: resolve as (value: unknown) => void, reject });
        socket!.send(JSON.stringify({ ...request, req_id }));
    });
};
