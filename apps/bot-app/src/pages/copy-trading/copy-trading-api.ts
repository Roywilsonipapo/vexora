import { sendDirect } from './direct-derivws';

/**
 * Deriv's real Copy Trading API. Every call name and field below is taken
 * from Deriv's own client library docs (deriv-com/deriv-api, DerivAPI.md)
 * and legacy-docs.deriv.com/docs/copy-trading.
 *
 * Routed through direct-derivws.ts, NOT api_base — api_base connects to
 * Deriv's newer "Trading API" product, which returned "Unrecognised
 * request" for every call in this file on first deploy. That product
 * doesn't implement account-management-class calls at all; it's scoped to
 * trade execution. get_settings/api_token/copy_start/copy_stop/
 * copytrading_list only exist on Deriv's classic API
 * (wss://ws.derivws.com), which direct-derivws.ts connects to separately
 * using the same OAuth token this app already holds. See that file's doc
 * comment for the full story.
 *
 * One thing this file could NOT verify against a real account (no live
 * Deriv login available while building this): the exact shape of the
 * copytrading_list response. The docs describe the call but not its return
 * fields, so getCopyTradingList() below is defensive — it surfaces the raw
 * response and lets the caller degrade gracefully rather than assume a
 * shape that might be wrong. Test this against a real account before
 * relying on it heavily.
 *
 * Scope note for the token created in "let others copy me": Deriv's valid
 * scopes are read, trade, trading_information, payments, admin. The token
 * shared with copiers only needs read + trading_information — it is used by
 * Deriv's backend to stream the trader's activity to copiers, not to place
 * trades on the trader's own account, so it deliberately excludes trade/
 * payments/admin. A leaked token scoped this way can't move money or place
 * trades on the sharer's account.
 */

type TApiResponse<T> = T & { error?: { message?: string; code?: string } };

const send = async <T>(request: Record<string, unknown>): Promise<TApiResponse<T>> => {
    return (await sendDirect(request)) as unknown as TApiResponse<T>;
};

/** Surfaces the real error instead of a generic string — some Deriv API
 *  wrapper calls reject the promise (rather than resolve with an `error`
 *  field) when the server sends one back, e.g. for a permission/scope
 *  problem, so the catch block needs to read it too, not just discard it. */
const describeError = (err: unknown, fallback: string): string => {
    if (err && typeof err === 'object') {
        const anyErr = err as { error?: { message?: string; code?: string }; message?: string };
        if (anyErr.error?.message) return anyErr.error.code ? `${anyErr.error.message} (${anyErr.error.code})` : anyErr.error.message;
        if (anyErr.message) return anyErr.message;
    }
    if (typeof err === 'string' && err) return err;
    return fallback;
};

const formatApiError = (error: { message?: string; code?: string } | undefined, fallback: string): string => {
    if (!error?.message) return fallback;
    return error.code ? `${error.message} (${error.code})` : error.message;
};

// ---------- allow_copiers (becoming copyable) ----------

export const getAllowCopiers = async (): Promise<{ allow_copiers: boolean } | { error: string }> => {
    try {
        const res = await send<{ get_settings?: { allow_copiers?: number } }>({ get_settings: 1 });
        if (res.error) return { error: formatApiError(res.error, 'Could not read account settings.') };
        return { allow_copiers: !!res.get_settings?.allow_copiers };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to read account settings.') };
    }
};

export const setAllowCopiers = async (allow: boolean): Promise<{ ok: true } | { error: string }> => {
    try {
        const res = await send<{ set_settings?: number }>({ set_settings: 1, allow_copiers: allow ? 1 : 0 });
        if (res.error) return { error: formatApiError(res.error, 'Deriv rejected the settings change.') };
        return { ok: true };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to change account settings.') };
    }
};

// ---------- API tokens (for sharing with copiers) ----------

export type TApiToken = { display_name: string; scopes: string[]; last_used?: string };

export const listApiTokens = async (): Promise<{ tokens: TApiToken[] } | { error: string }> => {
    try {
        const res = await send<{ api_token?: { tokens?: TApiToken[] } }>({ api_token: 1 });
        if (res.error) return { error: formatApiError(res.error, 'Could not list API tokens.') };
        return { tokens: res.api_token?.tokens ?? [] };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to list API tokens.') };
    }
};

/** Deriv only ever returns the raw token value once, at creation — it can't
 *  be re-displayed later, so the caller must show/copy it immediately. */
export const createSharingToken = async (
    name: string
): Promise<{ token: string } | { error: string }> => {
    try {
        const res = await send<{ api_token?: { new_token?: string } }>({
            api_token: 1,
            new_token: name,
            new_token_scopes: ['read', 'trading_information'],
        });
        if (res.error) return { error: formatApiError(res.error, 'Deriv rejected the token request.') };
        if (!res.api_token?.new_token) return { error: 'Deriv did not return a token.' };
        return { token: res.api_token.new_token };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to create a token.') };
    }
};

export const deleteApiToken = async (display_name: string): Promise<{ ok: true } | { error: string }> => {
    try {
        const res = await send<{ api_token?: unknown }>({ api_token: 1, delete_token: display_name });
        if (res.error) return { error: formatApiError(res.error, 'Deriv rejected the delete request.') };
        return { ok: true };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to delete the token.') };
    }
};

// ---------- copying another trader ----------

export type TCopyFilters = {
    max_trade_stake?: number;
    min_trade_stake?: number;
    trade_types?: string[];
};

export const startCopying = async (
    trader_token: string,
    filters: TCopyFilters = {}
): Promise<{ ok: true } | { error: string }> => {
    try {
        const request: Record<string, unknown> = { copy_start: trader_token };
        if (filters.max_trade_stake) request.max_trade_stake = filters.max_trade_stake;
        if (filters.min_trade_stake) request.min_trade_stake = filters.min_trade_stake;
        if (filters.trade_types?.length) request.trade_types = filters.trade_types;

        const res = await send<{ copy_start?: number }>(request);
        if (res.error) return { error: formatApiError(res.error, 'Deriv rejected the copy request.') };
        return { ok: true };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to start copying.') };
    }
};

export const stopCopying = async (trader_token: string): Promise<{ ok: true } | { error: string }> => {
    try {
        const res = await send<{ copy_stop?: number }>({ copy_stop: trader_token });
        if (res.error) return { error: formatApiError(res.error, 'Deriv rejected the stop request.') };
        return { ok: true };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to stop copying.') };
    }
};

/** Shape is unverified against a live account (see file doc comment) — the
 *  caller should treat this as best-effort and fall back to the locally
 *  tracked list this app keeps when starting a copy relationship. */
export const getCopyTradingList = async (): Promise<{ raw: unknown } | { error: string }> => {
    try {
        const res = await send<Record<string, unknown>>({ copytrading_list: 1 });
        if (res.error) return { error: formatApiError(res.error, 'Could not list copy relationships.') };
        return { raw: res.copytrading_list };
    } catch (err) {
        return { error: describeError(err, 'Could not reach Deriv to list copy relationships.') };
    }
};
