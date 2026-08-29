import { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { isDemoAccount } from '@/utils/account-helpers';
import {
    createSharingToken,
    deleteApiToken,
    getAllowCopiers,
    listApiTokens,
    setAllowCopiers,
    startCopying,
    stopCopying,
    TApiToken,
} from './copy-trading-api';
import { loadLocalCopies, maskToken, saveLocalCopies, TLocalCopy } from './local-copies';
import './copy-trading.scss';

/**
 * Copy Trading — Deriv's real copy_start/copy_stop/allow_copiers API, not a
 * custom relay. See copy-trading-api.ts for exact call/field sources.
 *
 * Only works between accounts of the same type (a demo token can only copy
 * a demo account, a real token only a real account) — that's enforced by
 * Deriv itself, not something this page adds.
 */

const TRADE_TYPE_OPTIONS: { value: string; label: string }[] = [
    { value: 'CALL', label: 'Rise (Call)' },
    { value: 'PUT', label: 'Fall (Put)' },
    { value: 'DIGITMATCH', label: 'Matches' },
    { value: 'DIGITDIFF', label: 'Differs' },
    { value: 'DIGITOVER', label: 'Over' },
    { value: 'DIGITUNDER', label: 'Under' },
    { value: 'DIGITODD', label: 'Odd' },
    { value: 'DIGITEVEN', label: 'Even' },
    { value: 'ONETOUCH', label: 'Touch' },
    { value: 'NOTOUCH', label: 'No Touch' },
];

const CopyTrading = observer(() => {
    const { client } = useStore();
    const is_demo = isDemoAccount(client.loginid ?? '');

    // "Let others copy me"
    const [allowCopiers, setAllowCopiersState] = useState<boolean | null>(null);
    const [togglingAllow, setTogglingAllow] = useState(false);
    const [tokens, setTokens] = useState<TApiToken[]>([]);
    const [tokensError, setTokensError] = useState<string | null>(null);
    const [newTokenName, setNewTokenName] = useState('');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const [creatingToken, setCreatingToken] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // "Copy someone"
    const [copyTokenInput, setCopyTokenInput] = useState('');
    const [maxStake, setMaxStake] = useState('');
    const [minStake, setMinStake] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [startedNote, setStartedNote] = useState<string | null>(null);

    const [activeCopies, setActiveCopies] = useState<TLocalCopy[]>([]);
    const [stoppingId, setStoppingId] = useState<string | null>(null);

    const loadAllowCopiers = useCallback(async () => {
        if (!client.is_logged_in) return;
        const res = await getAllowCopiers();
        if ('error' in res) return;
        setAllowCopiersState(res.allow_copiers);
    }, [client.is_logged_in]);

    const loadTokens = useCallback(async () => {
        if (!client.is_logged_in) return;
        setTokensError(null);
        const res = await listApiTokens();
        if ('error' in res) {
            setTokensError(res.error);
            return;
        }
        setTokens(res.tokens);
    }, [client.is_logged_in]);

    useEffect(() => {
        loadAllowCopiers();
        loadTokens();
        setActiveCopies(loadLocalCopies(client.loginid ?? ''));
    }, [loadAllowCopiers, loadTokens, client.loginid]);

    const handleToggleAllow = async () => {
        if (allowCopiers === null || togglingAllow) return;
        setTogglingAllow(true);
        const next = !allowCopiers;
        const res = await setAllowCopiers(next);
        if ('ok' in res) setAllowCopiersState(next);
        setTogglingAllow(false);
    };

    const handleCreateToken = async () => {
        if (!newTokenName.trim() || creatingToken) return;
        setCreatingToken(true);
        setCreateError(null);
        setCreatedToken(null);
        const res = await createSharingToken(newTokenName.trim());
        if ('error' in res) {
            setCreateError(res.error);
        } else {
            setCreatedToken(res.token);
            setNewTokenName('');
            loadTokens();
        }
        setCreatingToken(false);
    };

    const handleDeleteToken = async (display_name: string) => {
        const res = await deleteApiToken(display_name);
        if ('ok' in res) loadTokens();
    };

    const toggleTradeType = (value: string) => {
        setSelectedTypes(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
    };

    const handleStartCopying = async () => {
        const token = copyTokenInput.trim();
        if (!token || starting) return;
        setStarting(true);
        setStartError(null);
        setStartedNote(null);

        const filters = {
            max_trade_stake: maxStake ? Number(maxStake) : undefined,
            min_trade_stake: minStake ? Number(minStake) : undefined,
            trade_types: selectedTypes.length ? selectedTypes : undefined,
        };

        const res = await startCopying(token, filters);
        if ('error' in res) {
            setStartError(res.error);
        } else {
            const entry: TLocalCopy = {
                id: `copy-${Date.now()}`,
                token,
                label: `Trader ending …${token.slice(-4)}`,
                started_at: Date.now(),
                ...filters,
            };
            const next = [entry, ...activeCopies];
            setActiveCopies(next);
            saveLocalCopies(client.loginid ?? '', next);
            setCopyTokenInput('');
            setMaxStake('');
            setMinStake('');
            setSelectedTypes([]);
            setStartedNote('Copying started.');
        }
        setStarting(false);
    };

    const handleStopCopying = async (copy: TLocalCopy) => {
        setStoppingId(copy.id);
        const res = await stopCopying(copy.token);
        if ('ok' in res) {
            const next = activeCopies.filter(c => c.id !== copy.id);
            setActiveCopies(next);
            saveLocalCopies(client.loginid ?? '', next);
        }
        setStoppingId(null);
    };

    if (!client.is_logged_in) {
        return (
            <div className='vx-copytrade'>
                <div className='vx-copytrade__head'>
                    <h2>Copy Trading</h2>
                    <p>Log in to let others copy your trades, or to copy someone else's.</p>
                </div>
            </div>
        );
    }

    return (
        <div className='vx-copytrade'>
            <div className='vx-copytrade__head'>
                <h2>Copy Trading</h2>
                <p>
                    Deriv's real copy trading — nothing custom or simulated. Works only between accounts of the same
                    type: a {is_demo ? 'demo' : 'real'} account can only copy another {is_demo ? 'demo' : 'real'}{' '}
                    account's token, and only on Options-style contracts (Rise/Fall, Digits, Touch/No Touch) — not
                    Multipliers or Accumulators.
                </p>
            </div>

            <div className='vx-copytrade__grid'>
                <div className='vx-card vx-copytrade__panel'>
                    <h3>Let others copy me</h3>
                    <div className='vx-copytrade__toggle-row'>
                        <span>Allow copiers</span>
                        <button
                            type='button'
                            className={`vx-copytrade__switch ${allowCopiers ? 'is-on' : ''}`}
                            onClick={handleToggleAllow}
                            disabled={allowCopiers === null || togglingAllow}
                            role='switch'
                            aria-checked={!!allowCopiers}
                        >
                            <span className='vx-copytrade__switch-knob' />
                        </button>
                    </div>
                    <p className='vx-copytrade__hint'>
                        Turn this on, then share a token below. Anyone with it can start copying your Options trades
                        — they trade on their own account and balance, not yours.
                    </p>

                    <div className='vx-copytrade__tokens'>
                        <h4>Sharing tokens</h4>
                        {tokensError && <p className='vx-copytrade__error'>{tokensError}</p>}
                        {tokens.length === 0 && !tokensError && (
                            <p className='vx-copytrade__empty'>No tokens yet.</p>
                        )}
                        <ul>
                            {tokens.map(t => (
                                <li key={t.display_name}>
                                    <span className='vx-copytrade__token-name'>{t.display_name}</span>
                                    <span className='vx-copytrade__token-scopes'>{t.scopes?.join(', ')}</span>
                                    <button type='button' onClick={() => handleDeleteToken(t.display_name)}>
                                        Delete
                                    </button>
                                </li>
                            ))}
                        </ul>

                        <div className='vx-copytrade__create-token'>
                            <input
                                type='text'
                                placeholder='Token name, e.g. "copiers"'
                                value={newTokenName}
                                onChange={e => setNewTokenName(e.target.value)}
                                maxLength={32}
                            />
                            <button type='button' onClick={handleCreateToken} disabled={!newTokenName.trim() || creatingToken}>
                                {creatingToken ? 'Creating…' : 'Create token'}
                            </button>
                        </div>
                        <p className='vx-copytrade__scope-note'>
                            Created with read + trading_information scope only — it can't place trades or move money
                            on your account, even if someone else sees it.
                        </p>
                        {createError && <p className='vx-copytrade__error'>{createError}</p>}
                        {createdToken && (
                            <div className='vx-copytrade__created'>
                                <p>Copy this now — Deriv only shows it once:</p>
                                <code>{createdToken}</code>
                                <button
                                    type='button'
                                    onClick={() => navigator.clipboard?.writeText(createdToken)}
                                >
                                    Copy
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className='vx-card vx-copytrade__panel'>
                    <h3>Copy someone</h3>
                    <label className='vx-copytrade__field'>
                        <span>Their sharing token</span>
                        <input
                            type='password'
                            placeholder='Paste their token'
                            value={copyTokenInput}
                            onChange={e => setCopyTokenInput(e.target.value)}
                        />
                    </label>

                    <div className='vx-copytrade__stakes'>
                        <label className='vx-copytrade__field'>
                            <span>Max stake to copy</span>
                            <input
                                type='number'
                                min='0'
                                placeholder='No limit'
                                value={maxStake}
                                onChange={e => setMaxStake(e.target.value)}
                            />
                        </label>
                        <label className='vx-copytrade__field'>
                            <span>Min stake to copy</span>
                            <input
                                type='number'
                                min='0'
                                placeholder='No limit'
                                value={minStake}
                                onChange={e => setMinStake(e.target.value)}
                            />
                        </label>
                    </div>

                    <div className='vx-copytrade__types'>
                        <span className='vx-copytrade__types-label'>Trade types to copy (none selected = all)</span>
                        <div className='vx-copytrade__types-grid'>
                            {TRADE_TYPE_OPTIONS.map(opt => (
                                <button
                                    type='button'
                                    key={opt.value}
                                    className={selectedTypes.includes(opt.value) ? 'is-selected' : ''}
                                    onClick={() => toggleTradeType(opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {startError && <p className='vx-copytrade__error'>{startError}</p>}
                    {startedNote && <p className='vx-copytrade__success'>{startedNote}</p>}

                    <button
                        type='button'
                        className='vx-copytrade__cta'
                        onClick={handleStartCopying}
                        disabled={!copyTokenInput.trim() || starting}
                    >
                        {starting ? 'Starting…' : 'Start copying'}
                    </button>
                </div>
            </div>

            <div className='vx-card vx-copytrade__active'>
                <h3>Your active copies</h3>
                {activeCopies.length === 0 ? (
                    <p className='vx-copytrade__empty'>Not copying anyone right now.</p>
                ) : (
                    <ul>
                        {activeCopies.map(copy => (
                            <li key={copy.id}>
                                <div>
                                    <span className='vx-copytrade__copy-label'>{maskToken(copy.token)}</span>
                                    <span className='vx-copytrade__copy-meta'>
                                        started {new Date(copy.started_at).toLocaleString()}
                                        {copy.max_trade_stake ? ` · max ${copy.max_trade_stake}` : ''}
                                        {copy.min_trade_stake ? ` · min ${copy.min_trade_stake}` : ''}
                                        {copy.trade_types?.length ? ` · ${copy.trade_types.join(', ')}` : ''}
                                    </span>
                                </div>
                                <button
                                    type='button'
                                    onClick={() => handleStopCopying(copy)}
                                    disabled={stoppingId === copy.id}
                                >
                                    {stoppingId === copy.id ? 'Stopping…' : 'Stop'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <p className='vx-copytrade__note'>
                    Tracked on this device from when you started each one — Deriv doesn't hand back a shareable list
                    view for this. If you stop copying from a different device or browser, it won't appear here even
                    though it's genuinely stopped.
                </p>
            </div>
        </div>
    );
});

export default CopyTrading;
