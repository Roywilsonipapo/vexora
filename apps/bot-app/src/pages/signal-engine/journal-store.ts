/**
 * Trade journal — one entry per completed trade (paper or live), every
 * field a real observed value: nothing here is filled in after the fact to
 * make a result look better. Filtering/searching is left to the UI (plain
 * array methods over `entries`) rather than a bespoke query DSL.
 */

export type TMarketType = 'forex' | 'digits';

export type TJournalEntry = {
    id: number;
    time: number;
    market_type: TMarketType;
    symbol: string;
    contract_type: string;
    barrier?: number;
    duration: number;
    duration_unit: string;
    entry_spot: number;
    exit_spot: number;
    ensemble_probability: number;
    confidence_label: 'LOW' | 'MEDIUM' | 'HIGH';
    agreement_label: string;
    market_regime?: string;
    model_version: number;
    won: boolean;
    profit: number;
    is_paper: boolean;
};

const STORAGE_PREFIX = 'vx_signal_journal_';
const MAX_ENTRIES = 500;

const loadEntries = (key: string): TJournalEntry[] => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as TJournalEntry[]) : [];
    } catch {
        return [];
    }
};

const saveEntries = (key: string, entries: TJournalEntry[]): void => {
    try {
        localStorage.setItem(key, JSON.stringify(entries));
    } catch {
        // best-effort
    }
};

export class JournalStore {
    entries: TJournalEntry[];
    private id_counter: number;
    private storage_key: string;

    constructor(loginid: string) {
        this.storage_key = STORAGE_PREFIX + loginid;
        this.entries = loadEntries(this.storage_key);
        this.id_counter = this.entries.reduce((max, e) => Math.max(max, e.id), 0);
    }

    add(entry: Omit<TJournalEntry, 'id'>): TJournalEntry {
        const full: TJournalEntry = { ...entry, id: ++this.id_counter };
        this.entries = [full, ...this.entries].slice(0, MAX_ENTRIES);
        saveEntries(this.storage_key, this.entries);
        return full;
    }
}
