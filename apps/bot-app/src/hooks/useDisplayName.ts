import { useCallback, useState } from 'react';

/**
 * The dashboard used to greet by loginid ("Hello DOT92219861") — the trading
 * account ID, not a name. This app has no access to the account's real name:
 * it authorizes off a `balance` subscription (see api-base.ts), never calls
 * `get_settings`, so there is no email or first_name in the data it already
 * holds. Adding that call means a new authenticated request into api-base's
 * auth pipeline for what is otherwise a cosmetic greeting — more risk than
 * the value justifies. Instead this asks once, in-app, and remembers the
 * answer in localStorage — matching "or it asks you one time" from the ask.
 */

const STORAGE_KEY = 'vx_display_name';

const readStored = (): string => {
    try {
        return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

export const useDisplayName = (is_logged_in: boolean) => {
    const [name, setName] = useState<string>(readStored);
    const [dismissed_this_session, setDismissedThisSession] = useState(false);

    const save = useCallback((value: string) => {
        const trimmed = value.trim().slice(0, 40);
        if (!trimmed) return;
        setName(trimmed);
        try {
            localStorage.setItem(STORAGE_KEY, trimmed);
        } catch {
            /* private mode or blocked storage — still holds for this session */
        }
    }, []);

    const skip = useCallback(() => setDismissedThisSession(true), []);

    const should_prompt = is_logged_in && !name && !dismissed_this_session;

    return { name, save, skip, should_prompt };
};

export default useDisplayName;
