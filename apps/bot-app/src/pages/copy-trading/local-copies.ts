/**
 * Locally tracked record of copy relationships this browser started.
 *
 * copy_stop needs the same token string that copy_start was called with, and
 * Deriv's copytrading_list response shape isn't documented (see
 * copy-trading-api.ts), so this is the reliable way to offer a "stop" button
 * without asking the user to re-paste a token they may not have saved
 * elsewhere. Tokens are sensitive — kept in this browser's localStorage only,
 * never sent anywhere but Deriv's own API, and only the last few characters
 * are ever shown on screen.
 */

export type TLocalCopy = {
    id: string;
    token: string;
    label: string;
    started_at: number;
    max_trade_stake?: number;
    min_trade_stake?: number;
    trade_types?: string[];
};

const storageKey = (loginid: string) => `vx_copytrading_active_${loginid}`;

export const loadLocalCopies = (loginid: string): TLocalCopy[] => {
    if (!loginid) return [];
    try {
        const raw = localStorage.getItem(storageKey(loginid));
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

export const saveLocalCopies = (loginid: string, copies: TLocalCopy[]) => {
    if (!loginid) return;
    try {
        localStorage.setItem(storageKey(loginid), JSON.stringify(copies));
    } catch {
        /* private mode or blocked storage — list just won't persist */
    }
};

export const maskToken = (token: string) => {
    if (token.length <= 6) return '••••••';
    return `••••${token.slice(-4)}`;
};
