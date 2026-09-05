/**
 * The vendored TApiBaseApi types `send` as returning void (it's really a
 * promise-based call from the underlying @deriv/deriv-api instance — see
 * pages/market-analysis/tick-utils.ts, which hit the same gap). Every
 * caller here casts through this instead of `api_base.api` directly, so
 * `await api.send(...)` resolves to a real, typed response rather than
 * `void`.
 */
export type TApiSend<TResponse> = { send: (request: Record<string, unknown>) => Promise<TResponse> };
